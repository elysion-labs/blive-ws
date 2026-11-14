import { createHash } from 'node:crypto';

import type { MessageIdentity } from './types';

export function messageKey(identity: MessageIdentity): string | null {
  const { timestamp, roomId, uid, name, content } = identity;
  const sender = uid === 0 ? name : String(uid);

  if (timestamp === null || roomId === null || !sender) {
    return null;
  }

  const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');

  return `${timestamp}:${roomId}:${sender}:${contentHash}`;
}
