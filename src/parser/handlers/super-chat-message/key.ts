export function superChatKey(
  timestamp: number | null,
  roomId: number | null,
  id: string,
): string | null {
  if (timestamp === null || roomId === null) {
    return null;
  }

  return `${timestamp}:${roomId}:${id}`;
}
