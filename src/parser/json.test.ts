import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { parseRawJson, stringifyRawJson } from './json';
import { parseEvent } from './parse';

const preciseFile = new URL('../testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url);

describe('exact raw JSON integer preservation', () => {
  it('converts nanoseconds beyond Number.MAX_SAFE_INTEGER accurately without changing raw types', () => {
    const text = readFileSync(preciseFile, 'utf8');
    const raw = parseRawJson(text);
    expect(parseEvent(raw, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { timestamp: 1794675309999 },
    });
    expect(typeof (raw as { data: { trigger_time: unknown } }).data.trigger_time).toBe('number');
    expect(stringifyRawJson(raw)).toContain('1794675309999999999');
    expect(Object.getOwnPropertySymbols((raw as { data: object }).data)).toHaveLength(0);
  });

  it('does not pretend to recover precision from an already decoded unsafe number', () => {
    const raw: unknown = JSON.parse(readFileSync(preciseFile, 'utf8'));
    expect(parseEvent(raw, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { timestamp: 1794675310000 },
    });
  });

  it('does not apply stale integer metadata after a raw field is replaced', () => {
    const raw = parseRawJson(readFileSync(preciseFile, 'utf8')) as {
      data: { trigger_time: number };
    };

    raw.data.trigger_time = 2;
    expect(stringifyRawJson(raw)).not.toContain('1794675309999999999');
    expect(parseEvent(raw, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { timestamp: 0 },
    });
  });
});
