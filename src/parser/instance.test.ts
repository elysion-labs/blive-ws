import { describe, expect, it, mock } from 'bun:test';

import { fixtures } from '../testing/fixtures';
import { createParser } from './instance';

describe('createParser', () => {
  it('emits raw inputs and routes results to typed channels', () => {
    const parser = createParser({ roomId: 123 });
    const raw = mock();
    const event = mock();
    const unknown = mock();
    const mismatch = mock();
    parser.on('raw', raw);
    parser.on('event', event);
    parser.on('unknownCommand', unknown);
    parser.on('schemaMismatch', mismatch);
    parser.parse(fixtures.SEND_GIFT);
    parser.parse({ cmd: 'FUTURE' });
    parser.parse({ cmd: 'DANMU_MSG' });
    expect(raw).toHaveBeenCalledTimes(3);
    expect(event).toHaveBeenCalledTimes(1);
    expect(unknown).toHaveBeenCalledTimes(1);
    expect(mismatch).toHaveBeenCalledTimes(1);
    expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: 'gift', roomId: 123 }));
    expect(unknown).toHaveBeenCalledWith(expect.objectContaining({ command: 'FUTURE' }));
    expect(mismatch).toHaveBeenCalledWith(expect.objectContaining({ command: 'DANMU_MSG' }));
    expect(parser.getStatus()).toEqual({
      received: 3,
      parsed: 1,
      unknown: 1,
      mismatched: 1,
      schemaChanges: 0,
      observedCommands: 0,
      truncatedShapes: 0,
      lastDiagnostic: { type: 'schemaMismatch', command: 'DANMU_MSG' },
    });
  });

  it('returns independent snapshots and scopes observer state to each instance', () => {
    const first = createParser({ observeShapes: true });
    const second = createParser({ observeShapes: true });
    first.parse({ cmd: 'FUTURE' });
    const status = first.getStatus();
    status.received = 100;
    status.lastDiagnostic!.command = 'changed';
    expect(first.getStatus()).toMatchObject({ received: 1, lastDiagnostic: { command: 'FUTURE' } });
    expect(second.getStatus()).toMatchObject({ received: 0, observedCommands: 0 });
  });

  it('allows per-message context without changing instance defaults', () => {
    const parser = createParser({ roomId: 123 });
    expect(parser.parse({ cmd: 'LIVE' }, { roomId: 456 })).toMatchObject({
      event: { roomId: 456 },
    });
    expect(parser.parse({ cmd: 'LIVE' })).toMatchObject({ event: { roomId: 123 } });
  });

  it('unsubscribes individual registrations of the same callback', () => {
    const parser = createParser();
    const handler = mock();
    const unsubscribe = parser.on('event', handler);
    parser.on('event', handler);
    unsubscribe();
    unsubscribe();
    parser.parse({ cmd: 'LIVE' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reports newly observed fields and types once, with raw data', () => {
    const parser = createParser({ observeShapes: true });
    const change = mock();
    parser.on('schemaChange', change);
    parser.parse({ cmd: 'FUTURE', data: { count: 1 } });
    const input = { cmd: 'FUTURE:1', data: { count: '2', added: { child: true } } };
    parser.parse(input);
    parser.parse(input);
    parser.parse({ cmd: 'FUTURE', data: { count: 3 } });
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith({
      command: 'FUTURE',
      raw: input,
      truncated: false,
      changes: [
        {
          kind: 'typeChanged',
          path: '/data/count',
          previousTypes: ['number'],
          observedType: 'string',
        },
        { kind: 'fieldAdded', path: '/data/added', previousTypes: [], observedType: 'object' },
      ],
    });
    expect(parser.getStatus()).toMatchObject({ unknown: 4, schemaChanges: 1, observedCommands: 1 });
  });

  it('does not learn malformed known messages as valid shape samples', () => {
    const parser = createParser({ observeShapes: true });
    const change = mock();
    parser.on('schemaChange', change);
    parser.parse({ cmd: 'LIKE_INFO_V3_UPDATE', data: { click_count: 'broken' } });
    parser.parse(fixtures.LIKE_INFO_V3_UPDATE);
    expect(change).not.toHaveBeenCalled();
    expect(parser.getStatus()).toMatchObject({ mismatched: 1, parsed: 1, observedCommands: 1 });
  });

  it('does not classify consumer exceptions as parser errors', () => {
    const parser = createParser();
    const error = new Error('consumer failure');
    parser.on('event', () => {
      throw error;
    });
    expect(() => parser.parse({ cmd: 'LIVE' })).toThrow(error);
    expect(parser.getStatus()).toMatchObject({ parsed: 1, mismatched: 0 });
  });

  it('resets shape baselines without losing counters or subscriptions', () => {
    const parser = createParser({ observeShapes: true });
    const change = mock();
    parser.on('schemaChange', change);
    parser.parse({ cmd: 'FUTURE', value: 1 });
    parser.resetShapes();
    expect(parser.getStatus()).toMatchObject({ received: 1, observedCommands: 0 });
    parser.parse({ cmd: 'FUTURE', value: 'new baseline' });
    parser.parse({ cmd: 'FUTURE', value: false });
    expect(change).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid room IDs: %s', roomId => {
    expect(() => createParser({ roomId })).toThrow('roomId');
  });
});
