import type { EventBase, EventType, GuardLevel, KnownCommand, Medal, User } from '../events';
import { toMilliseconds } from '../time';
import type { ParseContext } from '../types';
import type { Fields } from '../validation';
import { InvalidField } from '../validation';

export function guardLevel(fields: Fields, key: string | number): GuardLevel | null {
  const value = fields.optionalNumber(key);

  if (value === null || value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }

  throw new InvalidField(fields.childPath(key), '0 | 1 | 2 | 3', value);
}

export function platformTimestamp(raw: Fields): number | null {
  return toMilliseconds(raw.optionalNumber('send_time'), 1, raw.childPath('send_time'));
}

function wireRoomId(raw: Fields, key: string): number | null {
  const value = raw.optionalId(key);

  if (value === null) {
    return null;
  }

  const result = Number(value);

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(result)) {
    throw new InvalidField(
      raw.childPath(key),
      'positive safe integer room ID or decimal string',
      raw.at(key),
    );
  }

  return result;
}

export function base<T extends EventType, C extends KnownCommand>(
  type: T,
  command: C,
  raw: Fields,
  context: ParseContext,
): EventBase<T, C> {
  const roomId = context.roomId ?? wireRoomId(raw, 'roomid') ?? wireRoomId(raw, 'room_id');

  if (roomId !== null && (!Number.isSafeInteger(roomId) || roomId <= 0)) {
    throw new InvalidField('/roomid', 'positive safe integer room ID', roomId);
  }

  return {
    key: null,
    type,
    command,
    cmd: raw.string('cmd'),
    roomId,
    timestamp: platformTimestamp(raw),
    sourceId: raw.optionalId('msg_id'),
  };
}

export function user(fields: Fields, modernKey = 'uinfo'): User {
  const modern = fields.optionalObject(modernKey);
  const profile = modern?.optionalObject('base');
  const idFields = modern?.has('uid') ? modern : fields;
  const guard = modern?.optionalObject('guard');

  return {
    id: idFields.integer('uid'),
    name: profile?.has('name') ? profile.string('name') : fields.optionalString('uname'),
    avatar: profile?.optionalString('face') ?? fields.optionalString('face'),
    guardLevel: guard ? guardLevel(guard, 'level') : guardLevel(fields, 'guard_level'),
  };
}

export function medal(fields: Fields | null, modern = false): Medal | null {
  if (!fields) {
    return null;
  }

  const level = fields.integer(modern ? 'level' : 'medal_level');

  if (level === 0) {
    return null;
  }

  return {
    name: fields.string(modern ? 'name' : 'medal_name'),
    level,
    anchorId: fields.optionalNumber(modern ? 'ruid' : 'target_id'),
    roomId: modern ? null : fields.optionalNumber('anchor_roomid'),
    lighted: fields.flag(modern ? 'is_light' : 'is_lighted'),
    guardLevel: guardLevel(fields, 'guard_level'),
  };
}

export function userMedal(
  fields: Fields,
  modernKey = 'uinfo',
  legacyKey = 'medal_info',
): Medal | null {
  const modern = fields.optionalObject(modernKey)?.optionalObject('medal');

  return modern ? medal(modern, true) : medal(fields.optionalObject(legacyKey));
}
