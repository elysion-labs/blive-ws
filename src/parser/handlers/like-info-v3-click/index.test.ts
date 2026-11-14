import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import emptyMedal from '../../../testing/live/LIKE_INFO_V3_CLICK/7734200-1e04cd7e6d698776.json';
import { createParser } from '../../instance';
import { parseEvent } from '../../parse';

describe('like-info-v3-click notification', () => {
  it('normalizes a real zero-level legacy medal to null when modern medal data is absent', () => {
    expect(parseEvent(emptyMedal, { roomId: 7734200 })).toMatchObject({
      status: 'parsed',
      event: { user: { guardLevel: null }, medal: null },
    });
  });

  it('delivers repeated likes and retains updated profile metadata', () => {
    const parser = createParser({ roomId: 123 });
    const events: unknown[] = [];
    parser.on('event', event => {
      events.push(event);
    });
    const first = parser.parse(fixtures.LIKE_INFO_V3_CLICK);

    const second = parser.parse({
      ...fixtures.LIKE_INFO_V3_CLICK,
      data: { ...fixtures.LIKE_INFO_V3_CLICK.data, face: 'different-avatar.png' },
    });

    if (first.status !== 'parsed' || second.status !== 'parsed') {
      throw new Error('Expected likes');
    }

    expect(events).toHaveLength(2);
    expect(first.event.key).toBe(second.event.key);
    expect(first.event.key).toStartWith('123:like:42:');
    expect(second.event).toMatchObject({ user: { avatar: 'different-avatar.png' } });
  });
});
