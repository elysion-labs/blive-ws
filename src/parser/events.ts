import type { commands } from './constants';

export type KnownCommand = keyof typeof commands;

export type EventType = (typeof commands)[KnownCommand];

export type GuardLevel = 0 | 1 | 2 | 3;

export interface User {
  id: number;
  name: string | null;
  avatar: string | null;
  guardLevel: GuardLevel | null;
  /** B 站直播荣耀等级。仅保留正整数，缺失、零或无效值为 null。 */
  wealthLevel: number | null;
}

export interface Medal {
  name: string;
  level: number;
  anchorId: number | null;
  roomId: number | null;
  lighted: boolean | null;
  guardLevel: GuardLevel | null;
}

export interface Emoticon {
  url: string;
  width: number | null;
  height: number | null;
}

export interface EventBase<T extends EventType, C extends KnownCommand> {
  /** Stable identity under the event's documented deduplication rules; null if unavailable. */
  key: string | null;
  type: T;
  command: C;
  /** Original command, including any protocol suffix. */
  cmd: string;
  roomId: number | null;
  /** Platform timestamp in milliseconds; never substituted with receipt time. */
  timestamp: number | null;
  /** Platform identifier; no synthetic identifier is generated. */
  sourceId: string | null;
}

export interface MessageEvent extends EventBase<'message', 'DANMU_MSG'> {
  user: User;
  content: string;
  color: number;
  mode: number;
  fontSize: number;
  medal: Medal | null;
  emoticon: Emoticon | null;
  inlineEmoticons: Record<string, Emoticon>;
  reply: { userId: number; userName: string } | null;
}

export interface GiftEvent extends EventBase<'gift', 'SEND_GIFT' | 'SEND_GIFT_V2'> {
  user: User;
  giftId: number;
  giftName: string;
  quantity: number;
  action: string | null;
  coinType: 'gold' | 'silver';
  totalCoin: number;
  /** Yuan for gold gifts, null for silver gifts. */
  price: number | null;
  medal: Medal | null;
}

export interface GuardEvent extends EventBase<'guard', 'USER_TOAST_MSG' | 'USER_TOAST_MSG_V2'> {
  user: User;
  guardLevel: GuardLevel;
  guardName: string;
  quantity: number;
  unit: string;
  /** Total paid amount in yuan. */
  price: number;
  startedAt: number;
  endedAt: number | null;
  message: string;
}

export interface SuperChatEvent extends EventBase<'superChat', 'SUPER_CHAT_MESSAGE'> {
  user: User;
  content: string;
  translatedContent: string | null;
  price: number;
  duration: number | null;
  medal: Medal | null;
}

export interface SuperChatDeleteEvent extends EventBase<
  'superChatDelete',
  'SUPER_CHAT_MESSAGE_DELETE'
> {
  ids: string[];
}

export interface LiveStartEvent extends EventBase<'liveStart', 'LIVE'> {
  startedAt: number | null;
  specialTypes: number[];
}

export type LiveEndEvent = EventBase<'liveEnd', 'PREPARING'>;

export interface LiveCutoffEvent extends EventBase<'liveCutoff', 'CUT_OFF'> {
  message: string;
}

export interface LiveWarningEvent extends EventBase<'liveWarning', 'WARNING'> {
  message: string;
}

export interface LikeEvent extends EventBase<'like', 'LIKE_INFO_V3_CLICK'> {
  user: User;
  message: string | null;
  medal: Medal | null;
}

export interface LikesUpdateEvent extends EventBase<'likesUpdate', 'LIKE_INFO_V3_UPDATE'> {
  count: number;
}

export interface EntryEvent extends EventBase<'entry', 'ENTRY_EFFECT'> {
  user: User;
  message: string | null;
  duration: number | null;
  privilegeType: number | null;
  medal: Medal | null;
}

export interface InteractionEvent extends EventBase<
  'interaction',
  'INTERACT_WORD' | 'INTERACT_WORD_V2'
> {
  user: User;
  /** 原始 msg_type，1 为进场，2 为关注，3 为分享。 */
  interactionType: number;
}

export type BiliEvent =
  | MessageEvent
  | GiftEvent
  | GuardEvent
  | SuperChatEvent
  | SuperChatDeleteEvent
  | LiveStartEvent
  | LiveEndEvent
  | LiveCutoffEvent
  | LiveWarningEvent
  | LikeEvent
  | LikesUpdateEvent
  | EntryEvent
  | InteractionEvent;
