import type { SuperChatDeleteEvent } from '../../events';
import { base } from '../../shared/fields';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { superChatDeleteKey } from './key';

export function parseSuperChatDelete(raw: Fields, context: ParseContext): SuperChatDeleteEvent {
  const ids = raw.object('data').array('ids');
  const eventBase = base('superChatDelete', 'SUPER_CHAT_MESSAGE_DELETE', raw, context);
  const values = Array.from({ length: ids.length }, (_, index) => ids.id(index));

  return {
    ...eventBase,
    key: superChatDeleteKey(eventBase.roomId, values),
    ids: values,
  };
}
