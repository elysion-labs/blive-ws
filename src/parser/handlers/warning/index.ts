import type { LiveWarningEvent } from '../../events';
import { base } from '../../shared/fields';
import { contentHash, notificationPrefix } from '../../shared/notification-key';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';

export function parseLiveWarning(raw: Fields, context: ParseContext): LiveWarningEvent {
  const eventBase = base('liveWarning', 'WARNING', raw, context);
  const message = raw.string('msg');
  const prefix = notificationPrefix(eventBase.roomId, 'liveWarning', eventBase.timestamp);

  return {
    ...eventBase,
    key: prefix === null ? null : `${prefix}:${contentHash(message)}`,
    message,
  };
}
