import { describe, expect, it } from 'bun:test';

import { fixtures } from '../testing/fixtures';
import { commands } from './constants';
import type { KnownCommand, MessageEvent, SuperChatEvent } from './events';
import { isKnownCommand, normalizeCommand, parseEvent } from './parse';

describe('parseEvent', () => {
  it.each(Object.keys(commands) as KnownCommand[])(
    'parses %s without changing the input',
    command => {
      const input = structuredClone(fixtures[command]);
      const before = structuredClone(input);
      const result = parseEvent(input, { roomId: 456 });
      expect(result.status).toBe('parsed');

      if (result.status !== 'parsed') {
        throw new Error(JSON.stringify(result));
      }

      expect(result.command).toBe(command);
      expect(result.event.type).toBe(commands[command]);
      expect(result.event.roomId).toBe(456);

      for (const event of result.events) {
        const key: string | null = event.key;
        expect(Object.hasOwn(event, 'key')).toBe(true);

        if (key !== null) {
          expect(key.split(':')).toContain('456');
          const otherRoom = parseEvent(input, { roomId: 789 });
          expect(otherRoom).toMatchObject({ status: 'parsed' });

          if (otherRoom.status === 'parsed') {
            expect(otherRoom.event.key).not.toBe(key);
          }
        }
      }

      expect(result.raw).toBe(input);
      expect(input).toEqual(before);
    },
  );

  it('preserves command suffixes and normalizes only for dispatch', () => {
    const input = { ...fixtures.DANMU_MSG, cmd: 'DANMU_MSG:4:0:2:2:2:0' };
    const result = parseEvent(input);
    expect(result).toMatchObject({
      status: 'parsed',
      command: 'DANMU_MSG',
      event: { cmd: input.cmd, content: '你好', sourceId: 'dm-1', timestamp: 1_700_000_000_123 },
    });
    expect(isKnownCommand('__proto__')).toBe(false);
    expect(normalizeCommand('NEW_COMMAND:1')).toBe('NEW_COMMAND');
  });

  it('normalizes a message, its medal, emotes and reply', () => {
    const input = structuredClone(fixtures.DANMU_MSG);
    (input.info[0] as unknown[])[13] = { url: 'emote.png', width: 100, height: 50 };
    (input.info[0] as unknown[])[15] = {
      extra: JSON.stringify({
        id_str: 'dm-2',
        show_reply: true,
        reply_mid: 88,
        reply_uname: '另一位观众',
        emots: { '[笑]': { url: 'smile.png', width: 16, height: 16 } },
      }),
      user: {
        base: { face: 'avatar.png' },
        medal: { name: '粉丝牌', level: 20, ruid: 9, is_light: 1, guard_level: 3 },
      },
    };
    expect(parseEvent(input)).toMatchObject({
      status: 'parsed',
      event: {
        type: 'message',
        user: { id: 42, name: '观众', avatar: 'avatar.png', guardLevel: 3 },
        color: 16777215,
        mode: 1,
        fontSize: 25,
        sourceId: 'dm-2',
        medal: {
          name: '粉丝牌',
          level: 20,
          anchorId: 9,
          roomId: null,
          lighted: true,
          guardLevel: 3,
        },
        emoticon: { url: 'emote.png', width: 100, height: 50 },
        inlineEmoticons: { '[笑]': { url: 'smile.png', width: 16, height: 16 } },
        reply: { userId: 88, userName: '另一位观众' },
      },
    });
  });

  it('handles minimal and legacy message metadata', () => {
    const input = structuredClone(fixtures.DANMU_MSG);
    (input.info[0] as unknown[]).length = 5;
    input.info[3] = [10, '旧粉丝牌', '', 123, 0, 0, 0, 0, 0, 0, 3, 1, 9];
    expect(parseEvent(input)).toMatchObject({
      status: 'parsed',
      event: { sourceId: null, user: { avatar: null }, medal: { name: '旧粉丝牌', roomId: 123 } },
    });
  });

  it('prefers modern gift users but supports legacy fields and silver currency', () => {
    const input = {
      ...fixtures.SEND_GIFT,
      data: {
        ...fixtures.SEND_GIFT.data,
        sender_uinfo: {
          uid: 99,
          base: { name: '现代用户', face: 'modern.png' },
          guard: { level: 2 },
        },
      },
    };

    expect(parseEvent(input)).toMatchObject({
      status: 'parsed',
      event: { user: { id: 99, name: '现代用户', guardLevel: 2 }, price: 2, quantity: 2 },
    });
    expect(parseEvent({ ...input, data: { ...input.data, coin_type: 'silver' } })).toMatchObject({
      status: 'parsed',
      event: { coinType: 'silver', price: null },
    });
    expect(parseEvent(fixtures.SEND_GIFT)).toMatchObject({
      status: 'parsed',
      event: { user: { id: 42 } },
    });
  });

  it('retains transaction IDs and converts guard prices once', () => {
    expect(parseEvent(fixtures.USER_TOAST_MSG_V2)).toMatchObject({
      status: 'parsed',
      event: {
        sourceId: '2412152205251792198695335',
        price: 198,
        quantity: 1,
        unit: '月',
        startedAt: 1_700_000_000_000,
        endedAt: 1_702_592_000_000,
        timestamp: 1_700_000_000_123,
        user: { guardLevel: 3 },
      },
    });
  });

  it('retains gift transaction IDs without using combo counters as identity', () => {
    expect(
      parseEvent({
        ...fixtures.SEND_GIFT,
        data: { ...fixtures.SEND_GIFT.data, tid: 'gift-transaction', batch_combo_id: 'combo' },
      }),
    ).toMatchObject({ status: 'parsed', event: { sourceId: 'gift-transaction' } });
  });

  it('normalizes room and like events and preserves absent source metadata', () => {
    expect(parseEvent(fixtures.LIVE)).toMatchObject({
      status: 'parsed',
      event: { startedAt: 1_700_000_000_000, specialTypes: [1] },
    });
    expect(parseEvent(fixtures.CUT_OFF)).toMatchObject({
      status: 'parsed',
      event: { message: '直播被切断', timestamp: null },
    });
    expect(parseEvent(fixtures.WARNING)).toMatchObject({
      status: 'parsed',
      event: { message: '直播警告', timestamp: null },
    });
    expect(parseEvent(fixtures.LIKE_INFO_V3_UPDATE)).toMatchObject({
      status: 'parsed',
      event: { count: 123 },
    });
    expect(parseEvent({ ...fixtures.PREPARING, roomid: '123' })).toMatchObject({
      status: 'parsed',
      event: { roomId: 123, timestamp: null, sourceId: null },
    });
    expect(
      parseEvent({
        cmd: 'LIKE_INFO_V3_CLICK',
        data: {
          uid: 42,
          uinfo: {
            base: { name: '现代用户' },
            medal: { name: '粉丝牌', level: 10, ruid: 9, is_light: true, guard_level: 3 },
          },
        },
      }),
    ).toMatchObject({
      status: 'parsed',
      event: { user: { name: '现代用户' }, medal: { name: '粉丝牌', lighted: true } },
    });
  });

  it('keeps super chat IDs as strings and prices in yuan', () => {
    expect(parseEvent(fixtures.SUPER_CHAT_MESSAGE)).toMatchObject({
      status: 'parsed',
      event: { sourceId: '90071992547409931234', price: 30, timestamp: 1_700_000_000_000 },
    });
    expect(parseEvent(fixtures.SUPER_CHAT_MESSAGE_DELETE)).toMatchObject({
      status: 'parsed',
      event: { ids: ['1', '90071992547409931234'], sourceId: null, timestamp: null },
    });
    const { ts: _ts, user_info: _userInfo, ...data } = fixtures.SUPER_CHAT_MESSAGE.data;
    expect(
      parseEvent({
        cmd: 'SUPER_CHAT_MESSAGE',
        data: { ...data, start_time: 1_700_000_001, uinfo: { base: { name: '现代用户' } } },
      }),
    ).toMatchObject({
      status: 'parsed',
      event: { timestamp: 1_700_000_001_000, user: { name: '现代用户' } },
    });
  });

  it('normalizes entry nanoseconds without manufacturing missing metadata', () => {
    expect(parseEvent(fixtures.ENTRY_EFFECT)).toMatchObject({
      status: 'parsed',
      event: { timestamp: 1_700_000_000_123, user: { id: 42 } },
    });
    expect(parseEvent({ cmd: 'ENTRY_EFFECT', data: { uid: 42 } })).toMatchObject({
      status: 'parsed',
      event: { timestamp: null, sourceId: null, user: { name: null } },
    });
    expect(parseEvent({ cmd: 'LIVE' })).toMatchObject({
      status: 'parsed',
      event: { timestamp: null, startedAt: null, sourceId: null },
    });
  });

  it.each([
    [null, ''],
    [[], ''],
    [{}, '/cmd'],
    [{ cmd: 5 }, '/cmd'],
    [{ cmd: '' }, '/cmd'],
    [{ cmd: ':1' }, '/cmd'],
    [{ cmd: ' ' }, '/cmd'],
    [{ cmd: 'DANMU_MSG' }, '/info'],
    [{ cmd: 'SEND_GIFT', data: { ...fixtures.SEND_GIFT.data, num: '2' } }, '/data/num'],
    [
      { cmd: 'SEND_GIFT', data: { ...fixtures.SEND_GIFT.data, coin_type: 'unknown' } },
      '/data/coin_type',
    ],
    [
      {
        cmd: 'SUPER_CHAT_MESSAGE',
        data: { ...fixtures.SUPER_CHAT_MESSAGE.data, id: Number.MAX_SAFE_INTEGER + 1 },
      },
      '/data/id',
    ],
    [{ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: Number.NaN } }, '/data/click_count'],
    [{ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: Infinity } }, '/data/click_count'],
    [{ cmd: 'WARNING', msg: null }, '/msg'],
    [{ cmd: 'SUPER_CHAT_MESSAGE_DELETE', data: { ids: [false] } }, '/data/ids/0'],
    [{ cmd: 'LIVE', live_time: -1 }, '/live_time'],
    [{ cmd: 'LIVE', live_time: Number.MAX_VALUE }, '/live_time'],
    [{ cmd: 'PREPARING', roomid: '123.5' }, '/roomid'],
    [{ cmd: 'PREPARING', room_id: '90071992547409931234' }, '/room_id'],
  ])('reports invalid input at its wire path: %j', (input, path) => {
    const result = parseEvent(input);
    expect(result).toMatchObject({ status: 'mismatch', issues: [{ path }] });
    expect(result.raw).toBe(input);
  });

  it.each(['{', 'null', '[]'])('reports malformed message extra JSON: %s', extra => {
    const input = structuredClone(fixtures.DANMU_MSG);
    (input.info[0] as unknown[])[15] = { extra };
    expect(parseEvent(input)).toMatchObject({
      status: 'mismatch',
      issues: [{ path: '/info/0/15/extra' }],
    });
  });

  it('returns unknown commands, including prototype property names, unchanged', () => {
    for (const cmd of ['NEW_EVENT:1', '__proto__', 'constructor', 'toString']) {
      const input = { cmd, data: { future: true } };
      expect(parseEvent(input)).toEqual({
        status: 'unknown',
        command: normalizeCommand(cmd),
        raw: input,
      });
    }
  });

  it('narrows parsed events by their discriminant', () => {
    const result = parseEvent(fixtures.DANMU_MSG);

    if (result.status === 'parsed' && result.event.type === 'message') {
      const event: MessageEvent = result.event;
      expect(event.type).toBe('message');
    }

    if (result.status === 'parsed' && result.event.type === 'superChat') {
      const event: SuperChatEvent = result.event;
      expect(event.type).toBe('superChat');
    }
  });
});
