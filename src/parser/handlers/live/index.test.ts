import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import { parseEvent } from '../../parse';

describe('live notification', () => {
  it('uses the upstream live start time and does not invent a missing one', () => {
    expect(parseEvent(fixtures.LIVE, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: {
        startedAt: 1700000000000,
        timestamp: 1700000000000,
        key: '1700000000:123:liveStart',
      },
    });
    expect(parseEvent({ cmd: 'LIVE' }, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { startedAt: null, timestamp: null, key: '123:liveStart' },
    });
  });

  it('keeps the key null when the real room is unavailable', () => {
    expect(parseEvent({ cmd: 'LIVE' })).toMatchObject({ event: { key: null } });
  });
});
