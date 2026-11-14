import { describe, expect, it, mock } from 'bun:test';

import cumulative from '../../../testing/live/SEND_GIFT_V2/7734200-fe973611bcf96425.json';
import batch from '../../../testing/synthetic/SEND_GIFT_V2_BATCH.json';
import invalidBase64 from '../../../testing/synthetic/SEND_GIFT_V2_INVALID_BASE64.json';
import truncated from '../../../testing/synthetic/SEND_GIFT_V2_TRUNCATED.json';
import wrongWire from '../../../testing/synthetic/SEND_GIFT_V2_WRONG_WIRE.json';
import { createParser } from '../../instance';
import { parseEvent } from '../../parse';

describe('SEND_GIFT_V2', () => {
  it('uses real cumulative combo amounts for identity while preserving the current payment', () => {
    expect(parseEvent(cumulative, { roomId: 7734200 })).toMatchObject({
      status: 'parsed',
      event: {
        quantity: 10,
        totalCoin: 1000,
        price: 1,
        medal: null,
        key: '1794690968:7734200:1794690965.6636:33988:2000',
      },
    });
  });

  it('returns every gift item, preserving IDs and currency independently', () => {
    const result = parseEvent(batch, { roomId: 123 });
    expect(result.status).toBe('parsed');

    if (result.status !== 'parsed') {
      throw new Error('Expected parsed protobuf');
    }

    expect(result.events).toHaveLength(2);
    expect(result.event).toBe(result.events[0]);
    expect(result.events[0]).toMatchObject({
      type: 'gift',
      command: 'SEND_GIFT_V2',
      roomId: 123,
      user: { id: 42, name: '观众', guardLevel: 3 },
      giftId: 1,
      giftName: '礼物',
      quantity: 2,
      sourceId: 'transaction-1',
      timestamp: 1_700_000_000_000,
      coinType: 'gold',
      totalCoin: 2000,
      price: 2,
    });
    expect(result.events[1]).toMatchObject({
      giftId: 2,
      giftName: '免费礼物',
      quantity: 3,
      sourceId: 'transaction-2',
      coinType: 'silver',
      totalCoin: 300,
      price: null,
    });
  });

  it('emits both normalized gifts but only one raw message', () => {
    const parser = createParser();
    const event = mock();
    const raw = mock();
    parser.on('event', event);
    parser.on('raw', raw);
    parser.parse(batch);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(event).toHaveBeenCalledTimes(2);
    expect(parser.getStatus()).toMatchObject({ received: 1, parsed: 1 });
  });

  it.each([invalidBase64, truncated, wrongWire])(
    'reports malformed protobuf as schemaMismatch',
    raw => {
      const result = parseEvent(raw);
      expect(result).toMatchObject({
        status: 'mismatch',
        command: 'SEND_GIFT_V2',
        issues: [{ path: '/data/pb' }],
      });
      expect(result.raw).toBe(raw);
    },
  );
});
