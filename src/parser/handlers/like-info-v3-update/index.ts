import type { LikesUpdateEvent } from '../../events';
import { base } from '../../shared/fields';
import { notificationPrefix } from '../../shared/notification-key';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';

export function parseLikesUpdate(raw: Fields, context: ParseContext): LikesUpdateEvent {
  const eventBase = base('likesUpdate', 'LIKE_INFO_V3_UPDATE', raw, context);
  const count = raw.object('data').integer('click_count');
  const prefix = notificationPrefix(eventBase.roomId, 'likesUpdate');

  return {
    ...eventBase,
    key: prefix === null ? null : `${prefix}:${count}`,
    count,
  };
}
