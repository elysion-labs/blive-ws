import { describe, expect, it } from 'bun:test';

import cutoff from '../../../testing/synthetic/CUT_OFF_TIME.json';
import { parseEvent } from '../../parse';

describe('cut-off notification', () => {
  it.each([cutoff])('preserves platform time without manufacturing missing time', raw => {
    const result = parseEvent(raw, { roomId: 123 });
    const { send_time: _time, ...missingTime } = raw;
    expect(result.status).toBe('parsed');

    if (result.status !== 'parsed') {
      throw new Error('Expected moderation');
    }

    expect(result.event).toMatchObject({
      type: 'liveCutoff',
      timestamp: 1700000000123,
      message: raw.msg,
    });
    expect(result.event.key).toMatch(/^1700000000123:123:liveCutoff:[a-f0-9]{64}$/);
    expect(parseEvent(missingTime, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { timestamp: null, message: raw.msg },
    });
    const fallback = parseEvent(missingTime, { roomId: 123 });

    if (fallback.status === 'parsed') {
      expect(fallback.event.key).toBe(result.event.key!.slice('1700000000123:'.length));
    }

    expect(parseEvent(raw)).toMatchObject({ event: { key: null } });
  });
});
