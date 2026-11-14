import type { Deferred } from './types';

export function deferred<T>(): Deferred<T> {
  const value = Promise.withResolvers<T>();
  // A stop may reject readiness before the caller starts awaiting it.
  void value.promise.catch(() => undefined);

  return value;
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);

    signal.addEventListener('abort', abort, { once: true });

    if (signal.aborted) {
      abort();
    }
  });
}
