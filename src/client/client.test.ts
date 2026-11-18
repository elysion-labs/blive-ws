import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { BiliEvent } from '../parser/events';
import { stringifyRawJson } from '../parser/json';
import { fixtures } from '../testing/fixtures';
import liveNoTime from '../testing/synthetic/LIVE_NO_TIME.json';
import jsonGiftKey from '../testing/synthetic/SEND_GIFT_KEY.json';
import gift from '../testing/synthetic/SEND_GIFT_V2_BATCH.json';
import protobufGiftKey from '../testing/synthetic/SEND_GIFT_V2_KEY.json';
import { createClient } from './client';
import { decodePackets, encodePacket } from './protocol';
import type { ClientOptions, Fetcher } from './types';

const resources: { close: () => void | Promise<void> }[] = [];

afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) {
    await resource.close();
  }
});

function httpApi(cookies: string[]): Fetcher {
  return async (input, init) => {
    const url = new URL(input);
    cookies.push(new Headers(init?.headers).get('Cookie') ?? '');
    let data: unknown;

    switch (url.pathname) {
      case '/x/web-interface/nav': {
        data = {
          isLogin: true,
          mid: 42,
          wbi_img: {
            img_url: 'https://example.com/0123456789abcdef0123456789abcdef.png',
            sub_url: 'https://example.com/fedcba9876543210fedcba9876543210.png',
          },
        };
        break;
      }

      case '/room/v1/Room/room_init': {
        data = { room_id: 123456, live_time: 1700000000 };
        break;
      }

      case '/xlive/web-room/v1/index/getDanmuInfo': {
        data = { token: 'server-token', host_list: [{ host: 'example.com', wss_port: 443 }] };
        expect(url.searchParams.get('w_rid')).toMatch(/^[a-f0-9]{32}$/);
        break;
      }

      default: {
        throw new Error(`Unexpected test API ${url.pathname}`);
      }
    }

    return Response.json({ code: 0, data });
  };
}

function server(
  options: {
    authenticate?: boolean;
    acknowledge?: boolean;
    closeFirst?: boolean;
    messages?: boolean;
    payloads?: string[];
  } = {},
) {
  let connections = 0;
  const auths: Record<string, unknown>[] = [];

  const instance = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, instance) {
      if (instance.upgrade(request, { data: { index: ++connections } })) {
        return;
      }

      return new Response('Upgrade failed', { status: 400 });
    },
    websocket: {
      data: {} as { index: number },
      message(socket, message) {
        const packet = decodePackets(Buffer.from(message as Uint8Array))[0];

        if (packet.operation === 7) {
          auths.push(JSON.parse(packet.body.toString()));

          if (options.authenticate === false) {
            return;
          }

          socket.send(encodePacket(8, '{"code":0}'));

          if (options.closeFirst && socket.data.index === 1) {
            setTimeout(() => socket.close(), 10);
          } else if (options.messages !== false) {
            socket.send(encodePacket(5, JSON.stringify(gift)));
            socket.send(encodePacket(5, '{"cmd":"FUTURE_EVENT"}'));
          }

          for (const payload of options.payloads ?? []) {
            socket.send(encodePacket(5, payload));
          }
        }

        if (packet.operation === 2 && options.acknowledge !== false) {
          const heartbeat = encodePacket(3, '0000');
          heartbeat.writeUInt32BE(100, 16);
          socket.send(heartbeat);
        }
      },
    },
  });

  resources.push({ close: () => instance.stop(true) });

  return { url: `ws://127.0.0.1:${instance.port}`, auths, connections: () => connections };
}

function client(url: string, overrides: Partial<ClientOptions> = {}) {
  const cookies: string[] = [];

  const value = createClient({
    roomId: 1,
    cookie: 'SESSDATA=test-secret; buvid3=device',
    reconnect: false,
    connectTimeout: 500,
    heartbeatInterval: 100,
    heartbeatTimeout: 200,
    fetch: httpApi(cookies),
    createWebSocket: (_address, init) => new WebSocket(url, init),
    ...overrides,
  });

  resources.push({ close: () => value.dispose() });

  return { value, cookies };
}

async function until(condition: () => boolean, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Condition timed out');
    }

    await Bun.sleep(2);
  }
}

describe('Bun live client', () => {
  it('accepts omitted Cookie, resolves anonymous identity and never sends a Cookie header', async () => {
    const host = server();
    const requests: string[] = [];
    const fallback = httpApi([]);

    const value = createClient({
      roomId: 6,
      reconnect: false,
      fetch: async (input, init) => {
        expect(new Headers(init?.headers).has('Cookie')).toBe(false);
        const path = new URL(input).pathname;
        requests.push(path);

        if (path === '/x/web-interface/nav') {
          return Response.json({
            code: -101,
            data: {
              isLogin: false,
              wbi_img: {
                img_url: 'https://example.com/0123456789abcdef0123456789abcdef.png',
                sub_url: 'https://example.com/fedcba9876543210fedcba9876543210.png',
              },
            },
          });
        }

        if (path === '/x/frontend/finger/spi') {
          return Response.json({ code: 0, data: { b_3: 'anonymous-device' } });
        }

        return fallback(input, init);
      },
      createWebSocket: (_url, options) => {
        expect(new Headers(options.headers).has('Cookie')).toBe(false);

        return new WebSocket(host.url, options);
      },
    });

    resources.push({ close: () => value.dispose() });
    const event = mock();
    value.on('event', event);
    await value.start();
    await until(() => event.mock.calls.length === 2);
    expect(host.auths[0]).toMatchObject({ uid: 0, roomid: 123456, buvid: 'anonymous-device' });
    expect(requests).toContain('/x/frontend/finger/spi');
    expect(value.getStatus().status).toBe('connected');
  });

  it('uses only message data and the resolved room for keys despite API and WS start-time changes', async () => {
    const host = server({
      messages: false,
      payloads: [
        readFileSync(
          new URL('../testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url),
          'utf8',
        ),
        JSON.stringify(fixtures.LIKE_INFO_V3_UPDATE),
        JSON.stringify(fixtures.PREPARING),
        JSON.stringify({ cmd: 'LIVE', live_time: 1700000100 }),
        JSON.stringify(fixtures.LIKE_INFO_V3_UPDATE),
        JSON.stringify(liveNoTime),
        JSON.stringify(fixtures.PREPARING),
      ],
    });

    const { value } = client(host.url);
    const events: BiliEvent[] = [];
    const raw: string[] = [];
    value.on('event', event => {
      events.push(event);
    });
    value.on('raw', input => {
      raw.push(stringifyRawJson(input));
    });
    await value.start();
    await until(() => events.length === 7);
    expect(events[0]).toMatchObject({
      timestamp: 1794675309999,
    });
    expect(raw[0]).toContain('1794675309999999999');
    expect(events.map(event => event.type)).toEqual([
      'entry',
      'likesUpdate',
      'liveEnd',
      'liveStart',
      'likesUpdate',
      'liveStart',
      'liveEnd',
    ]);

    expect(events[0].key).toBe('1794675309999999999:123456:42:entryEffect');
    expect(events[1].key).toBe('123456:likesUpdate:123');
    expect(events[2].key).toBe('123456:liveEnd');
    expect(events[3].key).toBe('1700000100:123456:liveStart');
    expect(events[4].key).toBe(events[1].key);
    expect(events[5].key).toBe('123456:liveStart');
    expect(events[6].key).toBe(events[2].key);

    expect(value.getStatus().liveStartTime).toBe(1700000100);
  });

  it('uses the resolved room in every event key instead of the requested short room or wire room', async () => {
    const inputs = { ...fixtures, SEND_GIFT: jsonGiftKey, SEND_GIFT_V2: protobufGiftKey };

    const host = server({
      messages: false,
      payloads: Object.values(inputs).map(raw => JSON.stringify(raw)),
    });

    const { value } = client(host.url);
    const events: BiliEvent[] = [];
    value.on('event', event => {
      events.push(event);
    });
    await value.start();
    await until(() => events.length === Object.keys(inputs).length);
    expect(value.getStatus()).toMatchObject({ roomId: 1, resolvedRoomId: 123456 });
    expect(host.auths[0]).toMatchObject({ roomid: 123456 });

    for (const event of events) {
      expect(event.roomId).toBe(123456);
      expect(typeof event.key).toBe('string');
      expect(event.key!.split(':')).toContain('123456');
    }
  });

  it('authenticates, decodes both gifts, forwards diagnostics and exposes independent state', async () => {
    const host = server();
    const { value, cookies } = client(host.url);
    const events = mock();
    const raw = mock();
    const unknown = mock();
    value.on('event', events);
    value.on('raw', raw);
    value.on('unknownCommand', unknown);
    const first = value.start();
    expect(value.start()).toBe(first);
    await first;
    await until(() => value.getStatus().lastHeartbeatAt !== null);
    expect(events).toHaveBeenCalledTimes(2);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(unknown).toHaveBeenCalledTimes(1);
    expect(host.auths[0]).toMatchObject({
      roomid: 123456,
      uid: 42,
      protover: 3,
      key: 'server-token',
      buvid: 'device',
    });
    expect(cookies.every(cookie => cookie.includes('test-secret'))).toBe(true);
    const state = value.getStatus();
    expect(state).toMatchObject({ status: 'connected', resolvedRoomId: 123456, popularity: 100 });
    state.parser.parsed = 999;
    expect(value.getStatus().parser.parsed).toBe(1);
    expect(JSON.stringify(state)).not.toContain('test-secret');
    expect(JSON.stringify(state)).not.toContain('server-token');
    await value.stop();
    expect(value.getStatus().status).toBe('stopped');
  });

  it('refreshes callback Cookie and token when reconnecting without duplicate sessions', async () => {
    const host = server({ closeFirst: true });
    let reads = 0;

    const parseCookie = mock((cookie: string) => ({
      buvid3: new Bun.CookieMap(cookie).get('buvid3') ?? undefined,
    }));

    const { value, cookies } = client(host.url, {
      cookie: () => `SESSDATA=secret-${++reads}; buvid3=device-${reads}`,
      parseCookie,
      reconnect: { initialDelay: 5, maxDelay: 5, healthyAfter: 1000, jitter: 0, maxRetries: 2 },
    });

    const events = mock();
    value.on('event', events);
    await value.start();
    await until(() => host.connections() === 2 && events.mock.calls.length === 2);
    expect(reads).toBe(2);
    expect(cookies).toContain('SESSDATA=secret-2; buvid3=device-2');
    expect(parseCookie).toHaveBeenCalledTimes(2);
    expect(host.auths.map(auth => auth.buvid)).toEqual(['device-1', 'device-2']);
    expect(value.getStatus()).toMatchObject({ status: 'connected', retryCount: 1 });
    await value.stop();
    await Bun.sleep(20);
    expect(host.connections()).toBe(2);
  });

  it('fails after the configured retry limit when authentication never arrives', async () => {
    const host = server({ authenticate: false });

    const { value } = client(host.url, {
      connectTimeout: 20,
      reconnect: { initialDelay: 2, maxDelay: 2, maxRetries: 1, jitter: 0 },
    });

    expect(value.start()).rejects.toThrow('authentication timed out');
    expect(host.connections()).toBe(2);
    expect(value.getStatus()).toMatchObject({ status: 'failed', retryCount: 1 });
  });

  it('identifies the API request that failed without exposing transport credentials', async () => {
    const fallback = httpApi([]);
    await using value = createClient({
      roomId: 1,
      reconnect: false,
      fetch: async (input, init) => {
        if (new URL(input).pathname === '/room/v1/Room/room_init') {
          throw new Error('SESSDATA=secret-leak');
        }

        return fallback(input, init);
      },
    });

    const failure = await value.start().catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'Bilibili /room/v1/Room/room_init request failed' });
    expect(JSON.stringify(value.getStatus())).not.toContain('secret-leak');
  });

  it('times out a pending API request even when the fetch hook ignores cancellation', async () => {
    await using value = createClient({
      roomId: 1,
      reconnect: false,
      connectTimeout: 50,
      fetch: () => new Promise(() => {}),
    });

    const failure = await value.start().catch((error: unknown) => error);
    expect(failure).toMatchObject({
      message: 'Bilibili /x/web-interface/nav request timed out or was cancelled',
    });
  });

  it('identifies the API response that contains invalid JSON', async () => {
    await using value = createClient({
      roomId: 1,
      reconnect: false,
      fetch: async () => new Response('SESSDATA=secret-leak'),
    });

    const failure = await value.start().catch((error: unknown) => error);
    expect(failure).toMatchObject({
      message: 'Bilibili /x/web-interface/nav response was not valid JSON',
    });
    expect(JSON.stringify(value.getStatus())).not.toContain('secret-leak');
  });

  it('detects missing protocol heartbeat replies even while the socket remains open', async () => {
    const host = server({ acknowledge: false, messages: false });
    const { value } = client(host.url, { heartbeatTimeout: 20 });
    await value.start();
    await until(() => value.getStatus().status === 'failed');
    expect(value.getStatus().lastError?.message).toBe('Bilibili heartbeat timed out');
  });

  it('stops a pending cookie provider promptly and ignores its stale completion', async () => {
    const host = server();
    const provider = Promise.withResolvers<string>();
    const { value } = client(host.url, { cookie: () => provider.promise });
    const ready = value.start();
    await value.stop();
    expect(ready).rejects.toThrow('stopped');
    provider.resolve('SESSDATA=old; buvid3=device');
    await Bun.sleep(10);
    expect(host.connections()).toBe(0);
    expect(value.getStatus().status).toBe('stopped');
  });

  it('sanitizes cookie failures and isolates synchronous and async subscribers', async () => {
    const host = server();

    const failed = client(host.url, {
      cookie: () => {
        throw new Error('SESSDATA=secret-leak');
      },
    }).value;

    expect(failed.start()).rejects.toThrow('Cookie provider failed');
    expect(JSON.stringify(failed.getStatus())).not.toContain('secret-leak');
    const { value } = client(host.url);
    const delivered = mock();
    value.on('event', () => {
      throw new Error('consumer error');
    });
    value.on('event', async () => {
      throw new Error('async consumer error');
    });
    value.on('event', delivered);
    value.on('error', () => {
      throw new Error('error-handler error');
    });
    await value.start();
    await until(() => delivered.mock.calls.length === 2);
    expect(value.getStatus().status).toBe('connected');
  });

  it('can restart but permanently rejects starts after disposal', async () => {
    const host = server();
    const { value } = client(host.url);
    await value.start();
    await value.restart();
    expect(host.connections()).toBe(2);
    await value.dispose();
    expect(value.getStatus().status).toBe('disposed');
    expect(value.start()).rejects.toThrow('disposed');
  });
});
