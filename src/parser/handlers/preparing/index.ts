import type { LiveEndEvent } from '../../events';
import { base } from '../../shared/fields';
import { notificationPrefix } from '../../shared/notification-key';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';

export function parseLiveEnd(raw: Fields, context: ParseContext): LiveEndEvent {
  const eventBase = base('liveEnd', 'PREPARING', raw, context);

  return {
    ...eventBase,
    key: notificationPrefix(eventBase.roomId, 'liveEnd'),
  };
}
