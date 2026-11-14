// @env bun
/* eslint-disable no-console -- This executable example displays live events and connection state. */
import { createClient, discoverRooms } from '@elysionjs/blive-ws';

const controller = new AbortController();
const stop = (): void => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

const duration = Number(process.env.BILI_EXAMPLE_SECONDS ?? 0);

if (!Number.isSafeInteger(duration) || duration < 0) {
  throw new Error('BILI_EXAMPLE_SECONDS must be a non-negative integer');
}

// Replace this callback with your Cookie service; it is called on every attempt.
const anonymous = process.argv.includes('--anonymous');
const cookie = anonymous ? undefined : (): string => process.env.BILI_COKKIES ?? '';

const requestedRoom =
  process.argv.slice(2).find(value => value !== '--anonymous') ??
  process.env.BILI_ROOM_IDS?.split(',')[0];

const roomId = requestedRoom
  ? Number(requestedRoom)
  : (await discoverRooms(cookie?.() ?? '', controller.signal))[0];

if (!roomId) {
  throw new Error('No live rooms found; pass a room ID as the first argument');
}

await using client = createClient({
  roomId,
  ...(cookie === undefined ? {} : { cookie }),
  observeShapes: true,
});
let received = 0;
let gifts = 0;
client.on('statusChange', state =>
  console.log('connection', state.status, 'room', state.resolvedRoomId ?? state.roomId),
);
client.on('error', error => console.error(error.message));
client.on('unknownCommand', result => console.log('unknown', result.command));
client.on('schemaMismatch', result =>
  console.error('schema mismatch', result.command, result.issues),
);
client.on('event', event => {
  received++;

  if (event.type === 'message') {
    console.log('message', event.user.name, event.content);
  }

  if (event.type === 'gift') {
    gifts++;
    console.log(
      'gift',
      event.user.name,
      event.giftName,
      `x${event.quantity}`,
      event.price,
      'yuan',
      'key',
      event.key,
    );
  }

  if (event.type === 'guard') {
    console.log('guard', event.user.name, event.guardName, event.price, 'key', event.key);
  }
});

const aborted = new Promise<void>(resolve => {
  if (controller.signal.aborted) {
    resolve();
  } else {
    controller.signal.addEventListener('abort', () => resolve(), { once: true });
  }
});

const stopClient = (): void => {
  void client.stop();
};

controller.signal.addEventListener('abort', stopClient, { once: true });
let deadline: ReturnType<typeof setTimeout> | undefined;

try {
  await client.start();

  if (duration > 0) {
    deadline = setTimeout(stop, duration * 1000);
  }

  console.log('Listening. Press Ctrl+C to stop.');
  await aborted;
} catch (error) {
  if (!controller.signal.aborted) {
    throw error;
  }
} finally {
  clearTimeout(deadline);
  controller.signal.removeEventListener('abort', stopClient);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  await client.stop();
  console.log('summary', { received, gifts, status: client.getStatus() });
}
