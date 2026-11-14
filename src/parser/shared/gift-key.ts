import type { GiftIdentity } from './types';

/** Approved composite identity shared by JSON and protobuf gifts. */
export function giftKey(identity: GiftIdentity): string | null {
  const { timestamp, roomId, batchComboId, giftId, amount } = identity;

  if (timestamp === null || roomId === null || !batchComboId) {
    return null;
  }

  const combo = batchComboId.slice(batchComboId.lastIndexOf(':') + 1);

  if (!combo) {
    return null;
  }

  return `${timestamp}:${roomId}:${combo}:${giftId}:${amount}`;
}
