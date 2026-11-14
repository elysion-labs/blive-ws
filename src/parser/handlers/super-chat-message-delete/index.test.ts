import { describe, expect, it } from 'bun:test';

import { fixtures } from '../../../testing/fixtures';
import empty from '../../../testing/synthetic/SUPER_CHAT_MESSAGE_DELETE_EMPTY.json';
import { parseEvent } from '../../parse';

describe('super-chat-message-delete notification', () => {
  it('normalizes target IDs to strings and preserves order and duplicates', () => {
    const first = parseEvent(fixtures.SUPER_CHAT_MESSAGE_DELETE, { roomId: 123 });

    const second = parseEvent(
      { cmd: 'SUPER_CHAT_MESSAGE_DELETE', data: { ids: ['90071992547409931234', 1, 1] } },
      { roomId: 123 },
    );

    if (first.status !== 'parsed' || second.status !== 'parsed') {
      throw new Error('Expected deletions');
    }

    expect(first.event).toMatchObject({ ids: ['1', '90071992547409931234'] });
    expect(second.event.key).toBe('123:superChatDelete:1,90071992547409931234');
    expect(first.event.key).toBe(second.event.key);
    expect(second.event).toMatchObject({ ids: ['90071992547409931234', '1', '1'] });
  });

  it('does not invent identity without a room or deletion targets', () => {
    expect(parseEvent(empty, { roomId: 123 })).toMatchObject({ event: { key: null, ids: [] } });
    expect(parseEvent({ ...fixtures.SUPER_CHAT_MESSAGE_DELETE, roomid: undefined })).toMatchObject({
      event: { key: null },
    });
  });
});
