import { createHash } from 'node:crypto';

export function contentHash(content: string | readonly unknown[]): string {
  return createHash('sha256')
    .update(typeof content === 'string' ? content : JSON.stringify(content), 'utf8')
    .digest('hex');
}

/** Missing platform time deliberately falls back to a room-scoped UI identity. */
export function notificationPrefix(
  roomId: number | null,
  type: string,
  time?: number | null,
): string | null {
  if (roomId === null) {
    return null;
  }

  return time === undefined || time === null ? `${roomId}:${type}` : `${time}:${roomId}:${type}`;
}
