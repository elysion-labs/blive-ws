import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import { createParser } from '../../instance';
import { parseEvent } from '../../parse';

describe('preparing notification', () => {
  it('uses the room context without requiring broadcast history', () => {
    const parser = createParser({ roomId: 123 });
    expect(parser.parse(fixtures.PREPARING)).toMatchObject({
      status: 'parsed',
      event: { type: 'liveEnd', roomId: 123, timestamp: null, key: '123:liveEnd' },
    });
    expect(parseEvent(fixtures.PREPARING, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { type: 'liveEnd', roomId: 123, timestamp: null },
    });
  });
});
