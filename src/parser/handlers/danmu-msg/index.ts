import type { Emoticon, Medal, MessageEvent } from '../../events';
import { decodeBase64, ProtoMessage } from '../../protobuf/reader';
import { base, guardLevel, medal, protoWealthLevel, userWealthLevel } from '../../shared/fields';
import { toMilliseconds } from '../../time';
import type { ParseContext } from '../../types';
import { Fields, InvalidField, record } from '../../validation';
import { messageKey } from './key';

function emoticon(fields: Fields): Emoticon {
  return {
    url: fields.string('url'),
    width: fields.optionalNumber('width'),
    height: fields.optionalNumber('height'),
  };
}

function extraFields(metadata: Fields): Fields | null {
  const text = metadata.optionalString('extra');

  if (text === null || text === '') {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidField(metadata.childPath('extra'), 'JSON object string', text);
  }

  if (!record(value)) {
    throw new InvalidField(metadata.childPath('extra'), 'JSON object string', value);
  }

  return new Fields(value, metadata.childPath('extra'));
}

function messageMedal(info: Fields, modern: Fields | null): Medal | null {
  const current = modern?.optionalObject('medal');

  if (current) {
    return medal(current, true);
  }

  if (!info.has(3)) {
    return null;
  }

  const legacy = info.array(3);

  if (legacy.length === 0) {
    return null;
  }

  return {
    level: legacy.integer(0),
    name: legacy.string(1),
    roomId: legacy.optionalNumber(3),
    anchorId: legacy.optionalNumber(12),
    lighted: legacy.flag(11),
    guardLevel: guardLevel(legacy, 10),
  };
}

function protobufWealthLevel(encoded: unknown): number | null {
  if (typeof encoded !== 'string' || encoded === '') {
    return null;
  }

  try {
    const message = new ProtoMessage(decodeBase64(encoded));

    return protoWealthLevel(message.message(20), 15);
  } catch (error) {
    // dm_v2 是补充数据，解码失败时仍保留已通过校验的 JSON 弹幕。
    if (error instanceof InvalidField) {
      return null;
    }

    throw error;
  }
}

function messageWealthLevel(raw: Fields, info: Fields, modernUser: Fields | null): number | null {
  const legacy = info.at(16);

  return (
    userWealthLevel(modernUser?.value) ??
    userWealthLevel(modernUser?.at('uinfo'), Array.isArray(legacy) ? legacy[0] : null) ??
    protobufWealthLevel(raw.at('dm_v2'))
  );
}

export function parseMessage(raw: Fields, context: ParseContext): MessageEvent {
  const info = raw.array('info');
  const style = info.array(0);
  const sender = info.array(2);
  const metadata = style.optionalObject(15);
  const modernUser = metadata?.optionalObject('user') ?? null;
  const profile = modernUser?.optionalObject('base');
  const extra = metadata ? extraFields(metadata) : null;
  const eventBase = base('message', 'DANMU_MSG', raw, context);
  const timestamp = toMilliseconds(style.integer(4), 1, style.childPath(4));
  const uid = sender.integer(0);
  const name = sender.string(1);
  const content = info.string(1);

  return {
    ...eventBase,
    timestamp,
    key: messageKey({ timestamp, roomId: eventBase.roomId, uid, name, content }),
    sourceId: extra?.optionalId('id_str') ?? eventBase.sourceId,
    user: {
      id: uid,
      name,
      avatar: profile?.optionalString('face') ?? null,
      guardLevel: guardLevel(info, 7),
      wealthLevel: messageWealthLevel(raw, info, modernUser),
    },
    content,
    color: style.integer(3),
    mode: style.integer(1),
    fontSize: style.integer(2),
    medal: messageMedal(info, modernUser),
    emoticon: wholeMessageEmoticon(style),
    inlineEmoticons: inlineEmoticons(extra),
    reply: messageReply(extra),
  };
}

function wholeMessageEmoticon(style: Fields): Emoticon | null {
  // The wire protocol uses the string "{}" for an absent whole-message emote.
  if (!style.has(13) || style.at(13) === '{}') {
    return null;
  }

  const emote = style.object(13);

  return emote.has('url') ? emoticon(emote) : null;
}

function inlineEmoticons(extra: Fields | null): Record<string, Emoticon> {
  const emots = extra?.optionalObject('emots');

  if (!emots) {
    return {};
  }

  return Object.fromEntries(
    Object.keys(emots.value).map(key => [key, emoticon(emots.object(key))]),
  );
}

function messageReply(extra: Fields | null): MessageEvent['reply'] {
  if (!extra?.flag('show_reply')) {
    return null;
  }

  return { userId: extra.integer('reply_mid'), userName: extra.string('reply_uname') };
}
