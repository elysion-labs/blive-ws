import { deferred } from '../../src/client/async';
import { createClient } from '../../src/client/client';
import type { CaptureOptions, CaptureResult } from './types';

/** Recording follows the same reconnecting client as applications. */
export async function captureRoom(options: CaptureOptions): Promise<CaptureResult> {
  if (
    !Number.isSafeInteger(options.seconds) ||
    options.seconds < 0 ||
    options.seconds * 1000 > 2_147_483_647
  ) {
    throw new TypeError('seconds must be a non-negative integer within the timer range');
  }

  options.signal.throwIfAborted();
  await using client = createClient({
    ...options.clientOptions,
    roomId: options.roomId,
    ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
  });
  const completion = deferred<void>();
  let stopping = false;
  let received = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function finish(error?: Error): void {
    if (stopping) {
      return;
    }

    stopping = true;

    if (error) {
      completion.reject(error);
    } else {
      completion.resolve();
    }

    void client.stop();
  }

  client.on('raw', raw => {
    if (stopping) {
      return;
    }

    try {
      const roomId = client.getStatus().resolvedRoomId;

      if (roomId === null) {
        throw new Error('Cannot record a broadcast before room resolution');
      }

      options.onMessage({
        version: 1,
        receivedAt: new Date().toISOString(),
        roomId,
        authentication: options.authentication,
        raw,
      });
      received++;
    } catch (error) {
      // Subscriber exceptions are otherwise isolated by LiveClient. Recording failures are fatal.
      finish(error instanceof Error ? error : new Error('Capture callback failed'));
    }
  });
  client.on('statusChange', state => {
    if (state.status === 'failed') {
      finish(new Error(state.lastError?.message ?? 'Capture client failed'));
    }
  });
  client.on('error', error => options.onError?.(error));

  const abort = (): void => finish();
  options.signal.addEventListener('abort', abort, { once: true });

  try {
    if (options.signal.aborted) {
      finish();
    } else {
      if (options.seconds > 0) {
        timer = setTimeout(abort, options.seconds * 1000);
      }

      await Promise.race([completion.promise, client.start()]);
    }

    await completion.promise;

    return {
      requestedRoomId: options.roomId,
      resolvedRoomId: client.getStatus().resolvedRoomId,
      received,
    };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', abort);
  }
}
