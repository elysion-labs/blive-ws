import type { EntryEvent } from '../../events';
import { base, user, userMedal } from '../../shared/fields';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { entryKey } from './key';
import { entryTimestamp } from './time';

export function parseEntry(raw: Fields, context: ParseContext): EntryEvent {
  const data = raw.object('data');
  const eventBase = base('entry', 'ENTRY_EFFECT', raw, context);
  const timestamp = entryTimestamp(data);
  const sender = user(data);
  const message = data.optionalString('copy_writing_v2');
  const privilegeType = data.optionalNumber('privilege_type');

  return {
    ...eventBase,
    key: entryKey(data, eventBase.roomId, sender.id, sender.name, message, privilegeType),
    timestamp: timestamp ?? eventBase.timestamp,
    user: {
      ...sender,
      avatar:
        data.optionalString('face') ??
        data.optionalObject('uinfo')?.optionalObject('base')?.optionalString('face') ??
        null,
    },
    message,
    duration: data.optionalNumber('effective_time'),
    privilegeType,
    medal: userMedal(data),
  };
}
