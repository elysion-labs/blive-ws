import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { Fetcher } from '../../src/client/types';
import { stringifyRawJson } from '../../src/parser/json';
import { encodePacket, decodePackets } from '../../src/protocol';
import { captureRoom } from './connection';
import type { CaptureRecord } from './types';

const resources: (() => void)[] = [];

afterEach(() => {
  for (const close of resources.splice(0).reverse()) {
    close();
  }
});

const fetcher: Fetcher = async input => {
  switch (new URL(input).pathname) {
    case '/x/web-interface/nav': {
      return Response.json({
        code: 0,
        data: {
          isLogin: false,
          wbi_img: {
            img_url: 'https://example.com/0123456789abcdef0123456789abcdef.png',
            sub_url: 'https://example.com/fedcba9876543210fedcba9876543210.png',
          },
        },
      });
    }

    case '/room/v1/Room/room_init': {
      return Response.json({ code: 0, data: { room_id: 7734200 } });
    }

    case '/xlive/web-room/v1/index/getDanmuInfo': {
      return Response.json({
        code: 0,
        data: { token: 'test-token', host_list: [{ host: 'example.com', wss_port: 443 }] },
      });
    }

    case '/x/frontend/finger/spi': {
      return Response.json({ code: 0, data: { b_3: 'anonymous-test-device' } });
    }

    default: {
      throw new Error('Unexpected test API');
    }
  }
};

function host(options: { reconnect?: boolean; authenticate?: boolean } = {}) {
  let connections = 0;

  const raw = readFileSync(
    new URL('../../src/testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url),
    'utf8',
  );

  const instance = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request, { data: { index: ++connections } })) {
        return;
      }

      return new Response('Upgrade failed', { status: 400 });
    },
    websocket: {
      data: {} as { index: number },
      message(socket, message) {
        const packet = decodePackets(Buffer.from(message as Uint8Array))[0];

        if (packet.operation === 7 && options.authenticate !== false) {
          socket.send(encodePacket(8, '{"code":0}'));
          socket.send(encodePacket(5, raw));
          socket.send(encodePacket(5, raw));

          if (options.reconnect && socket.data.index === 1) {
            setTimeout(() => socket.close(), 5);
          }
        }

        if (packet.operation === 2) {
          socket.send(encodePacket(3, '0000'));
        }
      },
    },
  });

  resources.push(() => instance.stop(true));

  return { url: `ws://127.0.0.1:${instance.port}`, connections: () => connections };
}

describe('continuous capture lifecycle', () => {
  it('records duplicate raw broadcasts across reconnects until explicitly stopped', async () => {
    const server = host({ reconnect: true });
    const controller = new AbortController();
    const records: CaptureRecord[] = [];

    const result = await captureRoom({
      roomId: 6,
      authentication: 'anonymous',
      seconds: 0,
      signal: controller.signal,
      clientOptions: {
        fetch: fetcher,
        createWebSocket: (_url, options) => new WebSocket(server.url, options),
        reconnect: { initialDelay: 1, maxDelay: 1, jitter: 0 },
      },
      onMessage: record => {
        records.push(record);

        if (records.length === 4) {
          controller.abort();
        }
      },
    });

    expect(server.connections()).toBe(2);
    expect(result).toEqual({ requestedRoomId: 6, resolvedRoomId: 7734200, received: 4 });
    expect(
      records.every(record => record.roomId === 7734200 && record.authentication === 'anonymous'),
    ).toBe(true);
    expect(stringifyRawJson(records[0], 0)).toContain('1794675309999999999');
  });

  it('propagates recording failures instead of letting subscriber isolation silently lose data', async () => {
    const server = host();
    const controller = new AbortController();
    expect(
      captureRoom({
        roomId: 6,
        authentication: 'anonymous',
        seconds: 0,
        signal: controller.signal,
        clientOptions: {
          fetch: fetcher,
          createWebSocket: (_url, options) => new WebSocket(server.url, options),
        },
        onMessage: () => {
          throw new Error('Simulated disk failure');
        },
      }),
    ).rejects.toThrow('Simulated disk failure');
    expect(server.connections()).toBe(1);
  });

  it('honors the time limit while initial WebSocket authentication is still pending', async () => {
    const server = host({ authenticate: false });

    const result = await captureRoom({
      roomId: 6,
      authentication: 'anonymous',
      seconds: 1,
      signal: new AbortController().signal,
      clientOptions: {
        fetch: fetcher,
        createWebSocket: (_url, options) => new WebSocket(server.url, options),
        connectTimeout: 10_000,
      },
      onMessage: () => {
        throw new Error('Unexpected raw broadcast');
      },
    });

    expect(result.received).toBe(0);
  });
});
