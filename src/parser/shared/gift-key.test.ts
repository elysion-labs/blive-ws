import { describe, expect, it } from 'bun:test';

import anonymous from '../../testing/live/SEND_GIFT_V2/6154037-11a9865a57d320ca.json';
import authenticated from '../../testing/live/SEND_GIFT_V2/6154037-b7018885d5fab2ff.json';
import jsonGift from '../../testing/synthetic/SEND_GIFT_KEY.json';
import protobufGift from '../../testing/synthetic/SEND_GIFT_V2_KEY.json';
import { parseEvent } from '../parse';

describe('approved gift document key', () => {
  it('keeps the same gift key when the anonymous delivery hides sender identity', () => {
    const first = parseEvent(authenticated, { roomId: 6154037 });
    const second = parseEvent(anonymous, { roomId: 6154037 });

    if (
      first.status !== 'parsed' ||
      second.status !== 'parsed' ||
      first.event.type !== 'gift' ||
      second.event.type !== 'gift'
    ) {
      throw new Error('Expected paired gifts');
    }

    expect(first.event.sourceId).toBe(second.event.sourceId);
    expect(first.event.user.id).not.toBe(0);
    expect(second.event.user.id).toBe(0);
    expect(first.event.key).not.toBeNull();
    expect(second.event.key).toBe(first.event.key);
  });

  it.each([jsonGift, protobufGift])(
    'uses upstream seconds, real room, combo suffix, gift ID and raw cumulative amount',
    raw => {
      expect(parseEvent(raw, { roomId: 123 })).toMatchObject({
        status: 'parsed',
        event: { key: '1700000000:123:1700000000.1234:1:2000', totalCoin: 1000 },
      });
    },
  );

  it('uses total_coin when combo_total_coin is absent, preserving an explicit zero', () => {
    const { combo_total_coin: _coin, ...data } = jsonGift.data;
    expect(parseEvent({ cmd: 'SEND_GIFT', data }, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { key: '1700000000:123:1700000000.1234:1:1000' },
    });
    expect(
      parseEvent({ cmd: 'SEND_GIFT', data: { ...data, combo_total_coin: 0 } }, { roomId: 123 }),
    ).toMatchObject({
      status: 'parsed',
      event: { key: '1700000000:123:1700000000.1234:1:0' },
    });
  });

  it('does not invent identities when timestamp, combo, or room is missing', () => {
    const { timestamp: _timestamp, ...withoutTime } = jsonGift.data;
    const { batch_combo_id: _combo, ...withoutCombo } = jsonGift.data;
    expect(parseEvent({ cmd: 'SEND_GIFT', data: withoutTime }, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { key: null },
    });
    expect(parseEvent({ cmd: 'SEND_GIFT', data: withoutCombo }, { roomId: 123 })).toMatchObject({
      status: 'parsed',
      event: { key: null },
    });
    expect(parseEvent(jsonGift)).toMatchObject({ status: 'parsed', event: { key: null } });
  });
});
