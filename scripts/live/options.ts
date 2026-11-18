import { resolve } from 'node:path';

import type { CaptureCliOptions } from './types';

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
): number {
  const result = value ? Number(value) : fallback;

  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  }

  return result;
}

export function resolveCaptureOptions(
  env: Record<string, string | undefined> = process.env,
  args: readonly string[] = process.argv.slice(2),
): CaptureCliOptions {
  const anonymous = args.includes('--anonymous');
  const cookie = anonymous ? undefined : env.BILI_COKKIES?.trim();

  if (!anonymous && !cookie) {
    throw new Error('Set BILI_COKKIES in .env or use --anonymous');
  }

  const seconds = integer(env.BILI_CAPTURE_SECONDS, 0, 'BILI_CAPTURE_SECONDS', 0);

  if (seconds * 1000 > 2_147_483_647) {
    throw new Error(
      'BILI_CAPTURE_SECONDS exceeds the timer range; use 0 for continuous monitoring',
    );
  }

  return {
    authentication: anonymous ? 'anonymous' : 'authenticated',
    cookie,
    seconds,
    maxBytes: integer(env.BILI_CAPTURE_MAX_BYTES, 64 * 1024 * 1024, 'BILI_CAPTURE_MAX_BYTES', 1),
    directory: resolve(
      env.BILI_CAPTURE_OUTPUT ?? `.captures/${new Date().toISOString().replaceAll(/[:.]/g, '-')}`,
    ),
    roomIds: env.BILI_ROOM_IDS
      ? [
          ...new Set(
            env.BILI_ROOM_IDS.split(',').map(value => integer(value.trim(), 0, 'BILI_ROOM_IDS', 1)),
          ),
        ]
      : undefined,
  };
}
