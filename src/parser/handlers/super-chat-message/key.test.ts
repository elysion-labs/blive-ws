import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import { parseEvent } from '../../parse';

describe('approved SC document key', () => {
  it('shares identity across audit and translation updates of the same SC', () => {
    const first = parseEvent(fixtures.SUPER_CHAT_MESSAGE, { roomId: 123 });

    const second = parseEvent(
      {
        ...fixtures.SUPER_CHAT_MESSAGE,
        data: {
          ...fixtures.SUPER_CHAT_MESSAGE.data,
          message_trans: 'translation',
          is_send_audit: 1,
        },
      },
      { roomId: 123 },
    );

    expect(first).toMatchObject({
      status: 'parsed',
      event: { key: '1700000000:123:90071992547409931234' },
    });

    if (
      first.status !== 'parsed' ||
      second.status !== 'parsed' ||
      first.event.type !== 'superChat' ||
      second.event.type !== 'superChat'
    ) {
      throw new Error('Expected SC');
    }

    expect(second.event.key).toBe(first.event.key);
  });
});
