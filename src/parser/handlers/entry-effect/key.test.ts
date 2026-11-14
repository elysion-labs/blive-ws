import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import noTime from '../../../testing/synthetic/ENTRY_EFFECT_NO_TIME.json';
import { parseRawJson } from '../../json';
import { parseEvent } from '../../parse';

describe('entry document key', () => {
  it('keeps exact upstream nanoseconds and uses a content identity without them', () => {
    const raw = parseRawJson(
      readFileSync(
        new URL('../../../testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url),
        'utf8',
      ),
    );

    expect(parseEvent(raw, { roomId: 123 })).toMatchObject({
      event: { key: '1794675309999999999:123:42:entryEffect' },
    });
    const fallback = parseEvent(noTime, { roomId: 123 });
    expect(fallback).toMatchObject({ status: 'parsed' });

    if (fallback.status !== 'parsed') {
      throw new Error('Expected entry');
    }

    expect(fallback.event.key).toMatch(/^123:entryEffect:42:[a-f0-9]{64}$/);
    expect(parseEvent(noTime, { roomId: 123 })).toMatchObject({
      event: { key: fallback.event.key },
    });
    expect(parseEvent(noTime)).toMatchObject({ event: { key: null } });
  });

  it('does not treat a rounded nanosecond number as an exact event identity', () => {
    const text = readFileSync(
      new URL('../../../testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url),
      'utf8',
    );

    const result = parseEvent(JSON.parse(text), { roomId: 123 });

    if (result.status !== 'parsed') {
      throw new Error('Expected entry');
    }

    expect(result.event.key).toMatch(/^123:entryEffect:42:[a-f0-9]{64}$/);
  });
});
