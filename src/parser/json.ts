import type { IntegerLexeme, RawJsonRuntime } from './json-types';

const integerLexemes = new WeakMap<object, Map<string, IntegerLexeme>>();

/** Keep exact large integer tokens without changing any visible raw field. */
export function parseRawJson(text: string): unknown {
  return JSON.parse(
    text,
    function (this: object, key: string, value: unknown, context?: { source?: string }) {
      if (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        !Number.isSafeInteger(value) &&
        context?.source &&
        /^-?\d+$/.test(context.source)
      ) {
        const entries = integerLexemes.get(this) ?? new Map<string, IntegerLexeme>();
        entries.set(key, { source: context.source, value });
        integerLexemes.set(this, entries);
      }

      return value;
    },
  );
}

export function exactInteger(holder: object, key: string): string | null {
  const value = (holder as Record<string, unknown>)[key];

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return value;
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  if (Number.isSafeInteger(value)) {
    return String(value);
  }

  const lexeme = integerLexemes.get(holder)?.get(key);

  return lexeme?.value === value ? lexeme.source : null;
}

/** Preserve captured integer tokens when recording the raw corpus. */
export function stringifyRawJson(value: unknown, space = 2): string {
  const result = JSON.stringify(
    value,
    function (this: object, key: string, item: unknown) {
      const lexeme = integerLexemes.get(this)?.get(key);

      return lexeme && lexeme.value === item
        ? (JSON as typeof JSON & RawJsonRuntime).rawJSON(lexeme.source)
        : item;
    },
    space,
  );

  if (result === undefined) {
    throw new TypeError('Input is not a JSON value');
  }

  return result;
}
