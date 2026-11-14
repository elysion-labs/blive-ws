import type { GiftEvent, Medal, User } from '../../events';
import { decodeBase64, ProtoMessage } from '../../protobuf/reader';
import { base } from '../../shared/fields';
import { giftKey } from '../../shared/gift-key';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import type { Fields } from '../../validation';
import { InvalidField } from '../../validation';

function level(value: number): 0 | 1 | 2 | 3 {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }

  throw new InvalidField('/data/pb', 'protobuf guard level 0 | 1 | 2 | 3', value);
}

function protoMedal(message: ProtoMessage): Medal | null {
  const value = message.message(8);

  if (!value || value.number(5) === 0) {
    return null;
  }

  return {
    anchorId: value.number(1),
    roomId: value.has(4) ? value.number(4) : null,
    level: value.number(5),
    name: value.string(6),
    lighted: value.has(11) ? value.number(11) !== 0 : null,
    guardLevel: value.has(12) ? level(value.number(12)) : null,
  };
}

function itemEvent(
  item: ProtoMessage,
  raw: Fields,
  context: ParseContext,
  user: User,
  medal: Medal | null,
): GiftEvent {
  const giftId = item.number(1);
  const quantity = item.number(3);
  const totalCoin = item.number(7);
  const coinType = item.string(8);
  const eventBase = base('gift', 'SEND_GIFT_V2', raw, context);
  const timestamp = item.has(10) ? item.number(10) : null;

  if (giftId < 1 || quantity < 1 || (coinType !== 'gold' && coinType !== 'silver')) {
    throw new InvalidField(
      '/data/pb',
      'protobuf gift ID, positive quantity and gold | silver currency',
      coinType,
    );
  }

  return {
    ...eventBase,
    key: giftKey({
      timestamp,
      roomId: eventBase.roomId,
      giftId,
      batchComboId: item.string(12) || null,
      amount: item.has(14) ? item.number(14) : totalCoin,
    }),
    user: { ...user },
    medal: medal ? { ...medal } : null,
    giftId,
    giftName: item.string(2),
    quantity,
    action: item.string(18) || null,
    coinType,
    totalCoin,
    price: coinType === 'gold' ? totalCoin / 1000 : null,
    sourceId: item.string(9) || null,
    timestamp: toMilliseconds(timestamp, 1000, '/data/pb'),
  };
}

/** Field numbers verified against real messages and the protobuf schema. */
export function parseGiftV2(raw: Fields, context: ParseContext): GiftEvent[] {
  const message = new ProtoMessage(decodeBase64(raw.object('data').string('pb')));
  const modern = message.message(15);
  const profile = modern?.message(2);

  const user: User = {
    id: modern?.has(1) ? modern.number(1) : message.number(1),
    name: profile?.string(1) ?? (message.string(2) || null),
    avatar: profile?.string(2) ?? (message.string(3) || null),
    guardLevel: level(message.number(5)),
  };

  const items = message.messages(10);

  if (items.length === 0) {
    throw new InvalidField('/data/pb', 'non-empty protobuf gift list (field 10)', []);
  }

  const medal = protoMedal(message);

  return items.map(item => itemEvent(item, raw, context, user, medal));
}
