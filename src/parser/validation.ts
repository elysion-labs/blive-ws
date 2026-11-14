import type { ValidationIssue } from './types';

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function present<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function valueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

export function pointerPart(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

export class InvalidField extends Error {
  readonly issue: ValidationIssue;

  constructor(path: string, expected: string, value: unknown) {
    super(`${path || '/'}: expected ${expected}, received ${valueType(value)}`);
    this.name = 'InvalidField';
    this.issue = { path, expected, actual: valueType(value) };
  }
}

/** A checked view; field paths always refer to the original wire message. */
export class Fields {
  constructor(
    readonly value: Record<string, unknown> | unknown[],
    readonly path = '',
  ) {}

  at(key: string | number): unknown {
    return (this.value as Record<string, unknown>)[key];
  }

  has(key: string | number): boolean {
    return present(this.at(key));
  }

  childPath(key: string | number): string {
    return `${this.path}/${pointerPart(String(key))}`;
  }

  object(key: string | number): Fields {
    const value = this.at(key);

    if (!record(value)) {
      throw new InvalidField(this.childPath(key), 'object', value);
    }

    return new Fields(value, this.childPath(key));
  }

  optionalObject(key: string | number): Fields | null {
    return this.has(key) ? this.object(key) : null;
  }

  array(key: string | number): Fields {
    const value = this.at(key);

    if (!Array.isArray(value)) {
      throw new InvalidField(this.childPath(key), 'array', value);
    }

    return new Fields(value, this.childPath(key));
  }

  get length(): number {
    if (!Array.isArray(this.value)) {
      throw new TypeError('length requires an array field');
    }

    return this.value.length;
  }

  string(key: string | number): string {
    const value = this.at(key);

    if (typeof value !== 'string') {
      throw new InvalidField(this.childPath(key), 'string', value);
    }

    return value;
  }

  number(key: string | number): number {
    const value = this.at(key);

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new InvalidField(this.childPath(key), 'finite number', value);
    }

    return value;
  }

  integer(key: string | number): number {
    const value = this.number(key);

    if (!Number.isSafeInteger(value)) {
      throw new InvalidField(this.childPath(key), 'safe integer', value);
    }

    return value;
  }

  optionalNumber(key: string | number): number | null {
    return this.has(key) ? this.number(key) : null;
  }

  optionalString(key: string | number): string | null {
    return this.has(key) ? this.string(key) : null;
  }

  id(key: string | number): string {
    const value = this.at(key);

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      return String(value);
    }

    throw new InvalidField(
      this.childPath(key),
      'non-empty string or non-negative safe integer',
      value,
    );
  }

  optionalId(key: string | number): string | null {
    return this.has(key) ? this.id(key) : null;
  }

  flag(key: string | number): boolean | null {
    const value = this.at(key);

    if (!present(value)) {
      return null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 0 || value === 1) {
      return Boolean(value);
    }

    throw new InvalidField(this.childPath(key), 'boolean or 0 | 1', value);
  }
}
