import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import changedText from '../../../testing/synthetic/LIKE_INFO_V3_CLICK_DIFFERENT_TEXT.json';
import { parseEvent } from '../../parse';

describe('like content key', () => {
  it('distinguishes text changes and keeps repeated identical likes available to listeners', () => {
    const first = parseEvent(fixtures.LIKE_INFO_V3_CLICK, { roomId: 123 });
    const changed = parseEvent(changedText, { roomId: 123 });

    if (first.status !== 'parsed' || changed.status !== 'parsed') {
      throw new Error('Expected likes');
    }

    expect(first.event.key).not.toBe(changed.event.key);
    expect(parseEvent(fixtures.LIKE_INFO_V3_CLICK)).toMatchObject({ event: { key: null } });
  });
});
