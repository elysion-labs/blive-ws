import type { LiveCutoffEvent } from '../../events';
import { base } from '../../shared/fields';
import { contentHash, notificationPrefix } from '../../shared/notification-key';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';

export function parseLiveCutoff(raw: Fields, context: ParseContext): LiveCutoffEvent {
  const eventBase = base('liveCutoff', 'CUT_OFF', raw, context);
  const message = raw.string('msg');
  const prefix = notificationPrefix(eventBase.roomId, 'liveCutoff', eventBase.timestamp);

  return {
    ...eventBase,
    key: prefix === null ? null : `${prefix}:${contentHash(message)}`,
    message,
  };
}
