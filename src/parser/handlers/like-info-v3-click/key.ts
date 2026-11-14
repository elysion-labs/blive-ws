import { contentHash } from '../../shared/notification-key';

export function likeKey(
  roomId: number | null,
  uid: number,
  name: string | null,
  message: string | null,
): string | null {
  const sender = uid === 0 ? name : String(uid);

  if (roomId === null || !sender) {
    return null;
  }

  return `${roomId}:like:${sender}:${contentHash(message ?? '')}`;
}
