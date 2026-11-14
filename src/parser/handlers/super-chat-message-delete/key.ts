export function superChatDeleteKey(roomId: number | null, ids: readonly string[]): string | null {
  if (roomId === null || ids.length === 0) {
    return null;
  }

  return `${roomId}:superChatDelete:${[...new Set(ids)].sort().join(',')}`;
}
