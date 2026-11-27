import type { SuperChatEvent, User } from '../../events';
import { base, guardLevel, userMedal, userWealthLevel, wealthLevel } from '../../shared/fields';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { superChatKey } from './key';

function superChatUser(data: Fields): User {
  const modern = data.optionalObject('uinfo');
  const legacyUser = data.optionalObject('user_info');
  const profile = modern?.optionalObject('base');
  const modernGuard = modern?.optionalObject('guard');
  let userGuardLevel = legacyUser ? guardLevel(legacyUser, 'guard_level') : null;

  if (modernGuard) {
    userGuardLevel = guardLevel(modernGuard, 'level');
  }

  return {
    id: data.integer('uid'),
    name: profile?.has('name') ? profile.string('name') : data.object('user_info').string('uname'),
    avatar:
      profile?.optionalString('face') ?? (legacyUser ? legacyUser.optionalString('face') : null),
    guardLevel: userGuardLevel,
    wealthLevel:
      userWealthLevel(data.at('uinfo'), legacyUser?.at('wealth_level')) ??
      wealthLevel(data.at('wealth_level')),
  };
}

export function parseSuperChat(raw: Fields, context: ParseContext): SuperChatEvent {
  const data = raw.object('data');
  const eventBase = base('superChat', 'SUPER_CHAT_MESSAGE', raw, context);
  const timestampKey = data.has('ts') ? 'ts' : 'start_time';
  const timestamp = data.integer(timestampKey);
  const sourceId = data.id('id');

  return {
    ...eventBase,
    timestamp: toMilliseconds(timestamp, 1000, data.childPath(timestampKey)),
    sourceId,
    key: superChatKey(timestamp, eventBase.roomId, sourceId),
    user: superChatUser(data),
    content: data.string('message'),
    translatedContent: data.optionalString('message_trans'),
    price: data.number('price'),
    duration: data.optionalNumber('time'),
    medal: userMedal(data),
  };
}
