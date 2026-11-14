import { exactInteger } from '../../json';
import { contentHash } from '../../shared/notification-key';
import type { Fields } from '../../validation';

export function entryKey(
  data: Fields,
  roomId: number | null,
  uid: number,
  name: string | null,
  message: string | null,
  privilegeType: number | null,
): string | null {
  const sender = uid === 0 ? name : String(uid);

  if (roomId === null || !sender) {
    return null;
  }

  const nanos = exactInteger(data.value, 'trigger_time');

  return nanos === null
    ? `${roomId}:entryEffect:${sender}:${contentHash([message, privilegeType])}`
    : `${BigInt(nanos)}:${roomId}:${sender}:entryEffect`;
}
