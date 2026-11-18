import { createRequire } from 'node:module';

import type {
  ClientOptions,
  ClientWebSocket,
  CookieParser,
  ResolvedOptions,
  ReconnectOptions,
  WebSocketFactory,
} from './types';

function milliseconds(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;

  if (!Number.isSafeInteger(result) || result < 1 || result > 2_147_483_647) {
    throw new TypeError(`${name} must be a positive timer duration in milliseconds`);
  }

  return result;
}

function reconnectOptions(reconnect: ReconnectOptions): Required<ReconnectOptions> {
  const maxRetries = reconnect.maxRetries ?? Infinity;
  const jitter = reconnect.jitter ?? 0.2;

  if (maxRetries !== Infinity && (!Number.isSafeInteger(maxRetries) || maxRetries < 0)) {
    throw new TypeError('reconnect.maxRetries must be a non-negative safe integer or Infinity');
  }

  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
    throw new TypeError('reconnect.jitter must be between 0 and 1');
  }

  return {
    maxRetries,
    jitter,
    initialDelay: milliseconds(reconnect.initialDelay, 1000, 'reconnect.initialDelay'),
    maxDelay: milliseconds(reconnect.maxDelay, 30_000, 'reconnect.maxDelay'),
    healthyAfter: milliseconds(reconnect.healthyAfter, 60_000, 'reconnect.healthyAfter'),
  };
}

const requireDependency = createRequire(import.meta.url);

function loadOptionalDependency(name: 'ws' | 'cookie', option: keyof ClientOptions): unknown {
  let path: string;

  try {
    path = requireDependency.resolve(name);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
      throw new TypeError(
        `Missing optional dependency "${name}". Install it or set the ${option} option.`,
      );
    }

    throw error;
  }

  return requireDependency(path);
}

function defaultWebSocketFactory(): WebSocketFactory {
  if (typeof Bun !== 'undefined') {
    return (url, options) => new WebSocket(url, options);
  }

  const { WebSocket: NodeWebSocket } = loadOptionalDependency('ws', 'createWebSocket') as {
    WebSocket: new (...args: Parameters<WebSocketFactory>) => ClientWebSocket;
  };

  return (url, options) => new NodeWebSocket(url, options);
}

function defaultCookieParser(): CookieParser {
  if (typeof Bun !== 'undefined') {
    return cookie => ({ buvid3: new Bun.CookieMap(cookie).get('buvid3') ?? undefined });
  }

  const { parseCookie } = loadOptionalDependency('cookie', 'parseCookie') as {
    parseCookie: CookieParser;
  };

  return parseCookie;
}

export function resolveOptions(options: ClientOptions): ResolvedOptions {
  if (!Number.isSafeInteger(options.roomId) || options.roomId <= 0) {
    throw new TypeError('roomId must be a positive safe integer');
  }

  const createWebSocket = options.createWebSocket ?? defaultWebSocketFactory();
  const parseCookie = options.parseCookie ?? (options.cookie ? defaultCookieParser() : undefined);

  return {
    ...options,
    parseCookie,
    connectTimeout: milliseconds(options.connectTimeout, 15_000, 'connectTimeout'),
    heartbeatInterval: milliseconds(options.heartbeatInterval, 30_000, 'heartbeatInterval'),
    heartbeatTimeout: milliseconds(options.heartbeatTimeout, 10_000, 'heartbeatTimeout'),
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    createWebSocket,
    reconnect: options.reconnect === false ? false : reconnectOptions(options.reconnect ?? {}),
  };
}
