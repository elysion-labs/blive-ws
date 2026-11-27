import type { EventBase, InteractionEvent, User } from '../../events';
import { decodeBase64, ProtoMessage } from '../../protobuf/reader';
import {
  base,
  checkedGuardLevel,
  protoWealthLevel,
  user,
  userWealthLevel,
  wireRoomId,
} from '../../shared/fields';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { entryTimestamp } from '../entry-effect/time';

function protobufGuardLevel(
  message: ProtoMessage,
  modern: ProtoMessage | null,
): User['guardLevel'] {
  const level = modern?.message(6)?.number(1) ?? (message.has(16) ? message.number(16) : null);

  return checkedGuardLevel(level, '/data/pb');
}

function protobufUser(message: ProtoMessage, data: Fields): User {
  const modern = message.message(22);
  const profile = modern?.message(2);

  return {
    id: modern?.has(1) ? modern.number(1) : message.number(1),
    name: (profile?.string(1) ?? message.string(2)) || null,
    avatar: profile?.string(2) ?? null,
    guardLevel: protobufGuardLevel(message, modern),
    wealthLevel:
      protoWealthLevel(modern, 4) ?? userWealthLevel(data.at('uinfo'), data.at('wealth_level')),
  };
}

function protobufInteraction(
  pb: string,
  data: Fields,
  eventBase: EventBase<'interaction', InteractionEvent['command']>,
): InteractionEvent {
  const message = new ProtoMessage(decodeBase64(pb));
  const timestamp = message.has(7) ? message.number(7) : null;

  return {
    ...eventBase,
    roomId: eventBase.roomId ?? (message.number(6) || null),
    timestamp: toMilliseconds(timestamp, 1000, '/data/pb') ?? eventBase.timestamp,
    user: protobufUser(message, data),
    interactionType: message.number(5),
  };
}

export function parseInteraction(
  raw: Fields,
  context: ParseContext,
  command: InteractionEvent['command'],
): InteractionEvent {
  const data = raw.object('data');
  const eventBase = base('interaction', command, raw, context);
  const pb = command === 'INTERACT_WORD_V2' ? data.optionalString('pb') : null;

  if (pb !== null) {
    return protobufInteraction(pb, data, eventBase);
  }

  return {
    ...eventBase,
    roomId: eventBase.roomId ?? wireRoomId(data, 'roomid'),
    timestamp:
      entryTimestamp(data) ??
      toMilliseconds(data.optionalNumber('timestamp'), 1000, data.childPath('timestamp')) ??
      eventBase.timestamp,
    user: user(data),
    interactionType: data.integer('msg_type'),
  };
}
