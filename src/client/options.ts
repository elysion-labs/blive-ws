import type { ClientOptions, ResolvedOptions, ReconnectOptions } from './types';

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

export function resolveOptions(options: ClientOptions): ResolvedOptions {
  if (!Number.isSafeInteger(options.roomId) || options.roomId <= 0) {
    throw new TypeError('roomId must be a positive safe integer');
  }

  return {
    ...options,
    connectTimeout: milliseconds(options.connectTimeout, 15_000, 'connectTimeout'),
    heartbeatInterval: milliseconds(options.heartbeatInterval, 30_000, 'heartbeatInterval'),
    heartbeatTimeout: milliseconds(options.heartbeatTimeout, 10_000, 'heartbeatTimeout'),
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    createWebSocket: options.createWebSocket ?? ((url, init) => new WebSocket(url, init)),
    reconnect: options.reconnect === false ? false : reconnectOptions(options.reconnect ?? {}),
  };
}
