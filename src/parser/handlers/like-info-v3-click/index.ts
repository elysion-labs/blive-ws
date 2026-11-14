import type { LikeEvent } from '../../events';
import { base, user, userMedal } from '../../shared/fields';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { likeKey } from './key';

export function parseLike(raw: Fields, context: ParseContext): LikeEvent {
  const data = raw.object('data');
  const eventBase = base('like', 'LIKE_INFO_V3_CLICK', raw, context);
  const sender = user(data);
  const message = data.optionalString('like_text');

  return {
    ...eventBase,
    key: likeKey(eventBase.roomId, sender.id, sender.name, message),
    user: sender,
    message,
    medal: userMedal(data, 'uinfo', 'fans_medal'),
  };
}
