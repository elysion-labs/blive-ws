import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { fixtures } from '../../../testing/fixtures';
import anonymous from '../../../testing/live/DANMU_MSG/6154037-487356e004fb7dc6.json';
import authenticated from '../../../testing/live/DANMU_MSG/6154037-c6b5c20f73787e1d.json';
import { parseEvent } from '../../parse';

describe('approved message document key', () => {
  it('uses the disclosed sender identity in paired real authenticated and anonymous deliveries', () => {
    const first = parseEvent(authenticated, { roomId: 6154037 });
    const second = parseEvent(anonymous, { roomId: 6154037 });

    if (
      first.status !== 'parsed' ||
      second.status !== 'parsed' ||
      first.event.type !== 'message' ||
      second.event.type !== 'message'
    ) {
      throw new Error('Expected paired messages');
    }

    expect(first.event.sourceId).toBe(second.event.sourceId);
    expect(first.event.user.id).not.toBe(0);
    expect(second.event.user.id).toBe(0);
    expect(second.event.key!.split(':')[2]).toBe(second.event.user.name!);
    expect(second.event.key).not.toBe(first.event.key);
  });

  it('uses upstream milliseconds, room, sender and exact UTF-8 content digest', () => {
    const result = parseEvent(fixtures.DANMU_MSG, { roomId: 123 });
    const hash = createHash('sha256').update('你好', 'utf8').digest('hex');
    expect(result).toMatchObject({
      status: 'parsed',
      event: { key: `1700000000123:123:42:${hash}` },
    });
  });

  it('separates different messages sent by the same user in the same millisecond', () => {
    const changed = structuredClone(fixtures.DANMU_MSG);
    changed.info[1] = '另一条弹幕';
    const first = parseEvent(fixtures.DANMU_MSG, { roomId: 123 });
    const second = parseEvent(changed, { roomId: 123 });

    if (
      first.status !== 'parsed' ||
      second.status !== 'parsed' ||
      first.event.type !== 'message' ||
      second.event.type !== 'message'
    ) {
      throw new Error('Expected messages');
    }

    expect(first.event.key).not.toBe(second.event.key);
  });

  it('uses the name for a zero UID and does not include display metadata', () => {
    const raw = structuredClone(fixtures.DANMU_MSG);
    (raw.info[2] as unknown[])[0] = 0;
    const result = parseEvent(raw, { roomId: 123 });
    expect(result.status).toBe('parsed');

    if (result.status !== 'parsed' || result.event.type !== 'message') {
      throw new Error('Expected message');
    }

    expect(result.event.key).toStartWith('1700000000123:123:观众:');
  });
});
