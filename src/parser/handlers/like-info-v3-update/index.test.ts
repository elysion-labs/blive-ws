import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import { parseEvent } from '../../parse';

describe('like-info-v3-update notification', () => {
  it('parses cumulative counters without requiring broadcast history', () => {
    const first = parseEvent(fixtures.LIKE_INFO_V3_UPDATE, {
      roomId: 123,
    });

    const second = parseEvent(
      { ...fixtures.LIKE_INFO_V3_UPDATE, data: { click_count: 124 } },
      {
        roomId: 123,
      },
    );

    expect(first).toMatchObject({
      status: 'parsed',
      event: { count: 123, roomId: 123, key: '123:likesUpdate:123' },
    });

    if (first.status !== 'parsed' || second.status !== 'parsed') {
      throw new Error('Expected counters');
    }

    expect(second.event).toMatchObject({ count: 124, roomId: 123, key: '123:likesUpdate:124' });
  });

  it('keeps the key null when the real room is unavailable', () => {
    expect(parseEvent(fixtures.LIKE_INFO_V3_UPDATE)).toMatchObject({ event: { key: null } });
  });
});
