// @env bun
import { discoverRooms } from '../src/client/api';
import { captureRoom } from './live/connection';
import { JsonlWriter } from './live/jsonl';
import { resolveCaptureOptions } from './live/options';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function main(): Promise<void> {
  const options = resolveCaptureOptions();
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  try {
    const rooms = options.roomIds ?? (await discoverRooms(options.cookie ?? '', controller.signal));

    if (rooms.length === 0) {
      throw new Error('No live rooms discovered; set BILI_ROOM_IDS explicitly');
    }

    using writer = new JsonlWriter({
      directory: options.directory,
      maxBytes: options.maxBytes,
      forbiddenValues: options.cookie ? [options.cookie] : [],
    });
    console.log(`JSONL output: ${options.directory}`);
    console.log(
      `Monitoring ${rooms.join(', ')} (${options.authentication}); ${options.seconds === 0 ? 'Ctrl+C to stop' : `${options.seconds}s including reconnect waits`}`,
    );

    const tasks = rooms.map(async roomId => {
      try {
        const result = await captureRoom({
          roomId,
          authentication: options.authentication,
          ...(options.authentication === 'anonymous'
            ? {}
            : { cookie: () => process.env.BILI_COKKIES?.trim() }),
          seconds: options.seconds,
          signal: controller.signal,
          onMessage: record => writer.write(record),
          onError: error => console.warn(`Room ${roomId}: ${error.message}`),
        });

        console.log(
          `Room ${roomId} -> ${result.resolvedRoomId ?? 'unresolved'}: recorded ${result.received} broadcasts`,
        );
      } catch (error) {
        controller.abort();
        throw error;
      }
    });

    // Wait for every reader to stop before closing the shared file descriptor.
    const results = await Promise.allSettled(tasks);

    const failure =
      results.find(result => result.status === 'rejected' && !isAbortError(result.reason)) ??
      results.find(result => result.status === 'rejected');

    if (failure?.status === 'rejected') {
      throw failure.reason;
    }

    console.log(JSON.stringify(writer.getStatus(), null, 2));
  } catch (error) {
    if (!controller.signal.aborted || !isAbortError(error)) {
      throw error;
    }
  } finally {
    controller.abort();
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Capture failed');
  process.exitCode = 1;
}
