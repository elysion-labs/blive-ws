import { commands } from './constants';
import type { BiliEvent, KnownCommand } from './events';
import { parseLiveCutoff } from './handlers/cut-off';
import { parseMessage } from './handlers/danmu-msg';
import { parseEntry } from './handlers/entry-effect';
import { parseInteraction } from './handlers/interact-word';
import { parseLike } from './handlers/like-info-v3-click';
import { parseLikesUpdate } from './handlers/like-info-v3-update';
import { parseLiveStart } from './handlers/live';
import { parseLiveEnd } from './handlers/preparing';
import { parseGift } from './handlers/send-gift';
import { parseGiftV2 } from './handlers/send-gift-v2';
import { parseSuperChat } from './handlers/super-chat-message';
import { parseSuperChatDelete } from './handlers/super-chat-message-delete';
import { parseGuard } from './handlers/user-toast-msg-v2';
import { parseLiveWarning } from './handlers/warning';
import type { ParseContext, ParseResult, RawMessage } from './types';
import { Fields, InvalidField, record } from './validation';

const parsers = {
  DANMU_MSG: parseMessage,
  SEND_GIFT: parseGift,
  SEND_GIFT_V2: parseGiftV2,
  USER_TOAST_MSG: (raw, context) => parseGuard(raw, context, 'USER_TOAST_MSG'),
  USER_TOAST_MSG_V2: parseGuard,
  SUPER_CHAT_MESSAGE: parseSuperChat,
  SUPER_CHAT_MESSAGE_DELETE: parseSuperChatDelete,
  LIVE: parseLiveStart,
  PREPARING: parseLiveEnd,
  CUT_OFF: parseLiveCutoff,
  WARNING: parseLiveWarning,
  LIKE_INFO_V3_CLICK: parseLike,
  LIKE_INFO_V3_UPDATE: parseLikesUpdate,
  ENTRY_EFFECT: parseEntry,
  INTERACT_WORD: (raw, context) => parseInteraction(raw, context, 'INTERACT_WORD'),
  INTERACT_WORD_V2: (raw, context) => parseInteraction(raw, context, 'INTERACT_WORD_V2'),
} satisfies Record<KnownCommand, (raw: Fields, context: ParseContext) => BiliEvent | BiliEvent[]>;

export function normalizeCommand(cmd: string): string {
  // DANMU_MSG:4:0:2:2:2:0 is the same command with protocol metadata.
  return cmd.split(':', 1)[0];
}

export function isKnownCommand(command: string): command is KnownCommand {
  return Object.hasOwn(commands, command);
}

/** Parse an already decoded JSON message, without I/O or observer state. */
export function parseEvent(input: unknown, context: ParseContext = {}): ParseResult {
  let command: string | null = null;

  try {
    if (!record(input)) {
      throw new InvalidField('', 'message object', input);
    }

    const raw = new Fields(input);
    const cmd = raw.string('cmd');

    if (cmd.length === 0) {
      throw new InvalidField('/cmd', 'non-empty command string', cmd);
    }

    command = normalizeCommand(cmd);

    if (command.trim().length === 0) {
      throw new InvalidField('/cmd', 'non-empty command name', cmd);
    }

    if (!isKnownCommand(command)) {
      return { status: 'unknown', command, raw: input as RawMessage };
    }

    const output = parsers[command](raw, context);
    const events = Array.isArray(output) ? output : [output];

    return {
      status: 'parsed',
      command,
      raw: input as RawMessage,
      event: events[0],
      events,
    };
  } catch (error) {
    if (!(error instanceof InvalidField)) {
      throw error;
    }

    return { status: 'mismatch', command, raw: input, issues: [error.issue] };
  }
}
