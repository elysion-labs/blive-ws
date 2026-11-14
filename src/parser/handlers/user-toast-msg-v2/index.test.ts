import { describe, expect, it } from 'bun:test';

import guard from '../../../testing/synthetic/USER_TOAST_MSG_V2_NO_SEND_TIME.json';
import { parseEvent } from '../../parse';

describe('approved guard document key', () => {
  it('uses start seconds, real room, name and raw amount without send_time', () => {
    const result = parseEvent(guard, { roomId: 32706521 });
    expect(result).toMatchObject({
      status: 'parsed',
      event: { key: '1794153767:32706521:船员:138000', price: 138 },
    });
  });

  it('remains the same across collectors and optional metadata changes', () => {
    const first = parseEvent(guard, { roomId: 32706521 });

    const second = parseEvent(
      { ...guard, send_time: 1794153767123, msg_id: 'different-delivery-id' },
      { roomId: 32706521 },
    );

    if (
      first.status !== 'parsed' ||
      second.status !== 'parsed' ||
      first.event.type !== 'guard' ||
      second.event.type !== 'guard'
    ) {
      throw new Error('Expected guards');
    }

    expect(first.event.key).toBe(second.event.key);
    expect(first.event.key).not.toContain('undefined');
  });

  it('leaves the key null until the actual room identity is available', () => {
    expect(parseEvent(guard)).toMatchObject({ status: 'parsed', event: { key: null } });
  });
});
