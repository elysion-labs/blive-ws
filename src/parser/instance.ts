import { parseEvent } from './parse';
import { ShapeObserver } from './shapes';
import type {
  EventParser,
  ParseContext,
  ParseResult,
  ParserEventMap,
  ParserOptions,
  ParserStatus,
  SchemaChangeDiagnostic,
} from './types';

type Subscriptions = {
  [K in keyof ParserEventMap]: Set<(value: ParserEventMap[K]) => void>;
};

export function createParser(options: ParserOptions = {}): EventParser {
  const defaultContext = { roomId: options.roomId };

  if (
    defaultContext.roomId !== undefined &&
    (!Number.isSafeInteger(defaultContext.roomId) || defaultContext.roomId <= 0)
  ) {
    throw new TypeError('roomId must be a positive safe integer');
  }

  const observer = options.observeShapes
    ? new ShapeObserver(options.observeShapes === true ? {} : options.observeShapes)
    : null;

  const subscriptions: Subscriptions = {
    raw: new Set(),
    event: new Set(),
    unknownCommand: new Set(),
    schemaMismatch: new Set(),
    schemaChange: new Set(),
  };

  const status: ParserStatus = {
    received: 0,
    parsed: 0,
    unknown: 0,
    mismatched: 0,
    schemaChanges: 0,
    observedCommands: 0,
    truncatedShapes: 0,
    lastDiagnostic: null,
  };

  function emit<K extends keyof ParserEventMap>(name: K, value: ParserEventMap[K]): void {
    [...subscriptions[name]].forEach(handler => handler(value));
  }

  function recordResult(result: ParseResult): void {
    status.received++;

    switch (result.status) {
      case 'parsed': {
        status.parsed++;
        break;
      }

      case 'unknown': {
        status.unknown++;
        status.lastDiagnostic = { type: 'unknownCommand', command: result.command };
        break;
      }

      case 'mismatch': {
        status.mismatched++;
        status.lastDiagnostic = { type: 'schemaMismatch', command: result.command };
        break;
      }
    }
  }

  function parse(input: unknown, context: ParseContext = {}): ParseResult {
    const result = parseEvent(input, { ...defaultContext, ...context });
    recordResult(result);

    let diagnostic: SchemaChangeDiagnostic | null = null;

    // Malformed messages must not teach the observer an invalid baseline.
    if (observer && result.status !== 'mismatch') {
      const observation = observer.observe(result.command, input);
      status.observedCommands = observer.size;

      if (observation.truncated) {
        status.truncatedShapes++;
      }

      if (observation.changes.length > 0) {
        status.schemaChanges++;
        status.lastDiagnostic = { type: 'schemaChange', command: result.command };
        diagnostic = {
          command: result.command,
          raw: result.raw,
          ...observation,
        };
      }
    }

    /*
     * User handlers run outside parseEvent's validation boundary. Their errors
     * propagate to the caller rather than being mislabeled as schema failures.
     */
    emit('raw', input);

    if (result.status === 'parsed') {
      for (const event of result.events) {
        emit('event', event);
      }
    }

    if (result.status === 'unknown') {
      emit('unknownCommand', result);
    }

    if (result.status === 'mismatch') {
      emit('schemaMismatch', result);
    }

    if (diagnostic) {
      emit('schemaChange', diagnostic);
    }

    return result;
  }

  return {
    parse,
    on(name, handler) {
      // Keep each subscription independent, even for the same callback.
      const subscription = (value: ParserEventMap[typeof name]): void => handler(value);
      subscriptions[name].add(subscription);

      return () => subscriptions[name].delete(subscription);
    },
    getStatus: () => ({
      ...status,
      lastDiagnostic: status.lastDiagnostic ? { ...status.lastDiagnostic } : null,
    }),
    resetShapes: () => {
      observer?.clear();
      status.observedCommands = 0;
    },
  };
}
