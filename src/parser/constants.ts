export const commands = {
  DANMU_MSG: 'message',
  SEND_GIFT: 'gift',
  SEND_GIFT_V2: 'gift',
  USER_TOAST_MSG: 'guard',
  USER_TOAST_MSG_V2: 'guard',
  SUPER_CHAT_MESSAGE: 'superChat',
  SUPER_CHAT_MESSAGE_DELETE: 'superChatDelete',
  LIVE: 'liveStart',
  PREPARING: 'liveEnd',
  CUT_OFF: 'liveCutoff',
  WARNING: 'liveWarning',
  LIKE_INFO_V3_CLICK: 'like',
  LIKE_INFO_V3_UPDATE: 'likesUpdate',
  ENTRY_EFFECT: 'entry',
  INTERACT_WORD: 'interaction',
  INTERACT_WORD_V2: 'interaction',
} as const;

export const shapeLimits = {
  maxCommands: 128,
  maxPaths: 512,
  maxDepth: 12,
  maxArrayItems: 16,
} as const;

/** DANMU_MSG uses positional tuples rather than collections at these paths. */
export const tuplePaths: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['DANMU_MSG', new Set(['/info', '/info/0', '/info/2', '/info/3'])],
]);
