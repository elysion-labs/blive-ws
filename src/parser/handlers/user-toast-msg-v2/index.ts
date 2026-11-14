import type { GuardEvent } from '../../events';
import { base, guardLevel, user } from '../../shared/fields';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import { InvalidField } from '../../validation';
import type { Fields } from '../../validation';

export function parseGuard(raw: Fields, context: ParseContext): GuardEvent {
  const data = raw.object('data');
  const guard = data.object('guard_info');
  const payment = data.object('pay_info');
  const level = guardLevel(guard, 'guard_level');

  if (level === null || level === 0) {
    throw new InvalidField(guard.childPath('guard_level'), '1 | 2 | 3', level);
  }

  const eventBase = base('guard', 'USER_TOAST_MSG_V2', raw, context);
  const sender = user(data, 'sender_uinfo');
  const rawPrice = payment.integer('price');
  const startSeconds = guard.integer('start_time');

  const startedAt = toMilliseconds(
    guard.number('start_time'),
    1000,
    guard.childPath('start_time'),
  )!;

  return {
    ...eventBase,
    key:
      eventBase.roomId !== null && sender.name
        ? `${startSeconds}:${eventBase.roomId}:${sender.name}:${rawPrice}`
        : null,
    timestamp: eventBase.timestamp ?? startedAt,
    sourceId: payment.optionalId('payflow_id') ?? eventBase.sourceId,
    user: { ...sender, guardLevel: level },
    guardLevel: level,
    guardName: guard.string('role_name'),
    quantity: payment.integer('num'),
    unit: payment.string('unit'),
    price: rawPrice / 1000,
    startedAt,
    endedAt: toMilliseconds(guard.optionalNumber('end_time'), 1000, guard.childPath('end_time')),
    message: data.string('toast_msg'),
  };
}
