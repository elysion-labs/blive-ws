import { InvalidField } from './validation';

export function toMilliseconds(value: number | null, factor: number, path: string): number | null {
  if (value === null) {
    return null;
  }

  const result = Math.floor(value * factor);

  if (!Number.isSafeInteger(result) || result < 0 || result > 8.64e15) {
    throw new InvalidField(path, 'valid non-negative platform timestamp', value);
  }

  return result;
}
