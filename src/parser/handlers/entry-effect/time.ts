import { exactInteger } from '../../json';
import { toMilliseconds } from '../../time';
import type { Fields } from '../../validation';
import { InvalidField } from '../../validation';

export function entryTimestamp(data: Fields): number | null {
  if (!data.has('trigger_time')) {
    return null;
  }

  const value = data.at('trigger_time');
  const exact = exactInteger(data.value, 'trigger_time');

  if (exact !== null) {
    if (!/^\d{1,32}$/.test(exact)) {
      throw new InvalidField(
        data.childPath('trigger_time'),
        'non-negative nanosecond integer',
        value,
      );
    }

    return toMilliseconds(Number(BigInt(exact) / 1_000_000n), 1, data.childPath('trigger_time'));
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new InvalidField(
      data.childPath('trigger_time'),
      'nanosecond integer or decimal string',
      value,
    );
  }

  return toMilliseconds(value, 1e-6, data.childPath('trigger_time'));
}
