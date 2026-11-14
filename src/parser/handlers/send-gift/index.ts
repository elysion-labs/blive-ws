import type { GiftEvent } from '../../events';
import { base, user, userMedal } from '../../shared/fields';
import { giftKey } from '../../shared/gift-key';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import { InvalidField } from '../../validation';
import type { Fields } from '../../validation';

export function parseGift(raw: Fields, context: ParseContext): GiftEvent {
  const data = raw.object('data');
  const coinType = data.string('coin_type');

  if (coinType !== 'gold' && coinType !== 'silver') {
    throw new InvalidField(data.childPath('coin_type'), 'gold | silver', coinType);
  }

  const totalCoin = data.integer('total_coin');
  const eventBase = base('gift', 'SEND_GIFT', raw, context);
  const timestamp = data.has('timestamp') ? data.integer('timestamp') : null;
  const giftId = data.integer('giftId');
  const amount = data.has('combo_total_coin') ? data.integer('combo_total_coin') : totalCoin;

  return {
    ...eventBase,
    timestamp: toMilliseconds(timestamp, 1000, data.childPath('timestamp')),
    key: giftKey({
      timestamp,
      roomId: eventBase.roomId,
      giftId,
      amount,
      batchComboId: data.optionalString('batch_combo_id'),
    }),
    sourceId: data.optionalId('tid') ?? eventBase.sourceId,
    user: user(data, 'sender_uinfo'),
    giftId,
    giftName: data.string('giftName'),
    quantity: data.integer('num'),
    action: data.optionalString('action'),
    coinType,
    totalCoin,
    price: coinType === 'gold' ? totalCoin / 1000 : null,
    medal: userMedal(data, 'sender_uinfo'),
  };
}
