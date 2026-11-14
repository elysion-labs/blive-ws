import type { LiveStartEvent } from '../../events';
import { base } from '../../shared/fields';
import { notificationPrefix } from '../../shared/notification-key';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';

export function parseLiveStart(raw: Fields, context: ParseContext): LiveStartEvent {
  const startedAt = toMilliseconds(
    raw.optionalNumber('live_time'),
    1000,
    raw.childPath('live_time'),
  );

  const special = raw.has('special_types') ? raw.array('special_types') : null;
  const eventBase = base('liveStart', 'LIVE', raw, context);

  return {
    ...eventBase,
    key: notificationPrefix(
      eventBase.roomId,
      'liveStart',
      startedAt === null || startedAt === 0 ? null : startedAt / 1000,
    ),
    timestamp: eventBase.timestamp ?? startedAt,
    startedAt,
    specialTypes: special
      ? Array.from({ length: special.length }, (_, index) => special.integer(index))
      : [],
  };
}
