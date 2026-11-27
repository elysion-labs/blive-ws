import interactionV2 from './live/INTERACT_WORD_V2/26088559-5157306b2cd14b36.json';
import liveCutoff from './synthetic/CUT_OFF.json';
import message from './synthetic/DANMU_MSG.json';
import entry from './synthetic/ENTRY_EFFECT.json';
import interaction from './synthetic/INTERACT_WORD.json';
import like from './synthetic/LIKE_INFO_V3_CLICK.json';
import likesUpdate from './synthetic/LIKE_INFO_V3_UPDATE.json';
import liveStart from './synthetic/LIVE.json';
import liveEnd from './synthetic/PREPARING.json';
import gift from './synthetic/SEND_GIFT.json';
import giftV2 from './synthetic/SEND_GIFT_V2.json';
import superChat from './synthetic/SUPER_CHAT_MESSAGE.json';
import superChatDelete from './synthetic/SUPER_CHAT_MESSAGE_DELETE.json';
import legacyGuard from './synthetic/USER_TOAST_MSG.json';
import guard from './synthetic/USER_TOAST_MSG_V2.json';
import liveWarning from './synthetic/WARNING.json';

/** Representative inputs for every supported command. */
export const fixtures = {
  DANMU_MSG: message,
  SEND_GIFT: gift,
  SEND_GIFT_V2: giftV2,
  USER_TOAST_MSG_V2: guard,
  USER_TOAST_MSG: legacyGuard,
  SUPER_CHAT_MESSAGE: superChat,
  SUPER_CHAT_MESSAGE_DELETE: superChatDelete,
  LIVE: liveStart,
  PREPARING: liveEnd,
  CUT_OFF: liveCutoff,
  WARNING: liveWarning,
  LIKE_INFO_V3_CLICK: like,
  LIKE_INFO_V3_UPDATE: likesUpdate,
  ENTRY_EFFECT: entry,
  INTERACT_WORD: interaction,
  INTERACT_WORD_V2: interactionV2,
};
