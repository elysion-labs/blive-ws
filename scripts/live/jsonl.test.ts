import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { parseRawJson } from '../../src/parser/json';
import notice from '../../src/testing/live/LOG_IN_NOTICE/6154037-33be4a83c8e423c0.json';
import { JsonlWriter } from './jsonl';
import type { CaptureRecord } from './types';

const directories: string[] = [];

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'blive-jsonl-'));
  directories.push(path);

  return path;
}

function record(raw: unknown = notice): CaptureRecord {
  return {
    version: 1,
    receivedAt: '2026-11-15T00:00:00.000Z',
    roomId: 6154037,
    authentication: 'anonymous',
    raw,
  };
}

afterEach(() => {
  for (const path of directories.splice(0)) {
    if (
      dirname(resolve(path)) !== resolve(tmpdir()) ||
      !basename(path).startsWith('blive-jsonl-')
    ) {
      throw new Error('Unexpected temporary directory');
    }

    rmSync(path, { recursive: true, force: true });
  }
});

describe('streamed JSONL recording', () => {
  it('makes each complete line visible before close and preserves duplicate broadcasts', () => {
    const path = directory();
    using writer = new JsonlWriter({ directory: path, maxBytes: 1_000_000 });
    writer.write(record());
    const file = writer.getStatus().currentFile!;
    expect(JSON.parse(readFileSync(file, 'utf8').trim())).toEqual(record());
    writer.write(record());
    expect(
      readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
    ).toEqual([record(), record()]);
    expect(writer.getStatus()).toMatchObject({ records: 2, files: 1 });
  });

  it('preserves exact nanosecond tokens in a compact single-line envelope', () => {
    const raw = parseRawJson(
      readFileSync(
        new URL('../../src/testing/synthetic/ENTRY_EFFECT_PRECISE.json', import.meta.url),
        'utf8',
      ),
    );

    using writer = new JsonlWriter({ directory: directory(), maxBytes: 1_000_000 });
    writer.write(record(raw));
    const text = readFileSync(writer.getStatus().currentFile!, 'utf8');
    expect(text).toContain('1794675309999999999');
    expect(text.split('\n')).toHaveLength(2);
    const replay = parseRawJson(text) as CaptureRecord;
    expect(replay.roomId).toBe(6154037);
    expect(replay.authentication).toBe('anonymous');
  });

  it('rotates between records without splitting an oversized message', () => {
    const path = directory();
    using writer = new JsonlWriter({ directory: path, maxBytes: 1 });
    writer.write(record());
    writer.write(record());
    const files = readdirSync(path).sort();
    expect(files).toHaveLength(2);

    for (const file of files) {
      const text = readFileSync(join(path, file), 'utf8');
      expect(JSON.parse(text.trim())).toEqual(record());
    }

    expect(writer.getStatus()).toMatchObject({ records: 2, files: 2 });
  });

  it('never overwrites existing segments when recording restarts in the same directory', () => {
    const path = directory();
    const first = new JsonlWriter({ directory: path, maxBytes: 1_000_000 });
    first.write(record());
    const before = readFileSync(first.getStatus().currentFile!, 'utf8');
    first.close();
    using second = new JsonlWriter({ directory: path, maxBytes: 1_000_000 });
    second.write(record());
    expect(readFileSync(first.getStatus().currentFile!, 'utf8')).toBe(before);
    expect(second.getStatus().currentFile).not.toBe(first.getStatus().currentFile);
    expect(readdirSync(path)).toHaveLength(2);
  });

  it('rejects forbidden content before creating a file and refuses writes after close', () => {
    const path = directory();

    const writer = new JsonlWriter({
      directory: path,
      maxBytes: 1_000_000,
      forbiddenValues: [notice.data.notice_msg],
    });

    expect(() => writer.write(record())).toThrow('Credential appeared');
    expect(readdirSync(path)).toHaveLength(0);
    writer.close();
    writer.close();
    expect(() => writer.write(record())).toThrow('closed');
  });
});
