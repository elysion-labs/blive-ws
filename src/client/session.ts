import { parseRawJson } from '../parser/json';
import { decodePackets, encodePacket } from '../protocol';
import type { Packet } from '../protocol';
import { resolveConnection } from './api';
import { abortable } from './async';
import { requestHeaders } from './constants';
import { ConnectionError } from './errors';
import { resolveOptions } from './options';
import type { ClientOptions, CookieSource, LiveSession, SessionOptions } from './types';

export function createWebSocketSession(options: ClientOptions): LiveSession {
  const resolved = resolveOptions(options);

  return async session => {
    const { signal } = session;
    const preparation = AbortSignal.any([signal, AbortSignal.timeout(resolved.connectTimeout)]);
    const cookie = await readCookie(resolved.cookie, preparation);

    const connection = await resolveConnection(
      resolved.roomId,
      cookie,
      preparation,
      resolved.fetch,
      session.retryCount,
      resolved.parseCookie,
    );

    signal.throwIfAborted();
    session.onRoom(connection.roomId, connection.liveStartTime);

    await openSession({
      connection,
      cookie,
      signal,
      connectTimeout: resolved.connectTimeout,
      heartbeatInterval: resolved.heartbeatInterval,
      heartbeatTimeout: resolved.heartbeatTimeout,
      createWebSocket: resolved.createWebSocket,
      onAuthenticated: () => {
        session.onConnected();
        session.onReady();
      },
      onMessage: session.onMessage,
      onHeartbeat: session.onHeartbeat,
    });
  };
}

async function readCookie(source: CookieSource | undefined, signal: AbortSignal): Promise<string> {
  try {
    const value = typeof source === 'function' ? source(signal) : source;
    const cookie = await abortable(Promise.resolve(value ?? ''), signal);

    if (typeof cookie !== 'string' || /[\r\n]/.test(cookie)) {
      throw new Error('Invalid cookie');
    }

    return cookie;
  } catch {
    // Provider and fetch errors may embed Cookie headers; never forward them.
    throw new ConnectionError('Cookie provider failed or was cancelled');
  }
}

export function openSession(options: SessionOptions): Promise<void> {
  options.signal.throwIfAborted();

  const socket = options.createWebSocket(options.connection.url, {
    headers: { ...requestHeaders, ...(options.cookie ? { Cookie: options.cookie } : {}) },
  });

  socket.binaryType = 'arraybuffer';

  return new Promise((resolve, reject) => {
    let completed = false;
    let authenticated = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let heartbeatDeadline: ReturnType<typeof setTimeout> | undefined;

    const authDeadline = setTimeout(
      () => finish(new ConnectionError('WebSocket authentication timed out')),
      options.connectTimeout,
    );

    function finish(error?: Error): void {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(authDeadline);
      clearTimeout(heartbeatDeadline);
      clearInterval(heartbeat);
      options.signal.removeEventListener('abort', abort);
      socket.onopen = null;
      socket.onmessage = null;
      // ws 在握手期间被 terminate 时仍可能发出 error。
      socket.onerror = () => undefined;
      socket.onclose = null;
      socket.terminate();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    function abort(): void {
      finish();
    }

    function sendHeartbeat(): void {
      if (completed || heartbeatDeadline) {
        return;
      }

      try {
        socket.send(encodePacket(2, '[object Object]'));
        heartbeatDeadline = setTimeout(
          () => finish(new ConnectionError('Bilibili heartbeat timed out')),
          options.heartbeatTimeout,
        );
      } catch {
        finish(new ConnectionError('Failed to send heartbeat'));
      }
    }

    function authenticate(body: Buffer): void {
      const response: unknown = JSON.parse(body.toString());

      if (
        !response ||
        typeof response !== 'object' ||
        !('code' in response) ||
        response.code !== 0
      ) {
        finish(new ConnectionError('Bilibili rejected WebSocket authentication'));

        return;
      }

      if (authenticated) {
        return;
      }

      authenticated = true;
      clearTimeout(authDeadline);
      options.onAuthenticated();

      if (completed) {
        return;
      }

      sendHeartbeat();
      heartbeat = setInterval(sendHeartbeat, options.heartbeatInterval);
    }

    function packet(packet: Packet): void {
      switch (packet.operation) {
        case 8: {
          authenticate(packet.body);
          break;
        }

        case 3: {
          if (!authenticated) {
            return;
          }

          if (packet.body.length < 4) {
            throw new ConnectionError('Invalid heartbeat packet');
          }

          clearTimeout(heartbeatDeadline);
          heartbeatDeadline = undefined;
          options.onHeartbeat(packet.body.readUInt32BE(0));
          break;
        }

        case 5: {
          if (authenticated) {
            options.onMessage(parseRawJson(packet.body.toString()));
          }

          break;
        }
      }
    }

    options.signal.addEventListener('abort', abort, { once: true });

    socket.onopen = () => {
      try {
        socket.send(encodePacket(7, JSON.stringify(options.connection.auth)));
      } catch {
        finish(new ConnectionError('Failed to send WebSocket authentication'));
      }
    };

    socket.onmessage = event => {
      try {
        for (const message of decodePackets(Buffer.from(event.data as ArrayBuffer))) {
          if (completed) {
            break;
          }

          packet(message);
        }
      } catch {
        finish(new ConnectionError('Failed to decode a WebSocket packet'));
      }
    };

    socket.onerror = () => finish(new ConnectionError('WebSocket transport failed'));
    socket.onclose = event => finish(new ConnectionError(`WebSocket closed (code ${event.code})`));

    if (options.signal.aborted) {
      abort();
    }
  });
}
