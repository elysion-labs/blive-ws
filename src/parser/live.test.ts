import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import type { CaptureManifest } from '../../scripts/live/types';
import { parseRawJson } from './json';
import { isKnownCommand, normalizeCommand, parseEvent } from './parse';

const directory = new URL('../testing/live/', import.meta.url);
const expectedDirectory = new URL('../testing/expected/', import.meta.url);

const manifest = JSON.parse(
  readFileSync(new URL('manifest.json', directory), 'utf8'),
) as CaptureManifest;

describe('captured live raw regression corpus', () => {
  it('contains independent real broadcast samples with unique paths', () => {
    expect(manifest.source).toBe('bilibili-live-websocket');
    expect(manifest.entries.length).toBeGreaterThan(0);
    expect(new Set(manifest.entries.map(entry => entry.file)).size).toBe(manifest.entries.length);
    const listed = manifest.entries.map(entry => entry.file).sort();

    for (const folder of [directory, expectedDirectory]) {
      const files = readdirSync(folder, { recursive: true, encoding: 'utf8' })
        .filter(file => file.endsWith('.json') && file !== 'manifest.json')
        .map(file => file.replaceAll('\\', '/'))
        .sort();

      expect(files).toEqual(listed);
    }
  });

  for (const entry of manifest.entries) {
    it(entry.file, () => {
      const text = readFileSync(new URL(entry.file, directory), 'utf8');
      expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
      expect(entry.purpose.trim().length).toBeGreaterThan(0);

      if (entry.source) {
        expect(entry.source.file).toMatch(/^events-\d+\.jsonl$/);
        expect(Number.isSafeInteger(entry.source.line) && entry.source.line > 0).toBe(true);
      }

      const raw = parseRawJson(text);
      const before = structuredClone(raw);
      const result = parseEvent(raw, { roomId: entry.roomId });
      expect(result.raw).toBe(raw);
      expect(raw).toEqual(before);
      expect(result.command).toBe(entry.command);

      if (isKnownCommand(entry.command)) {
        expect(result.status).toBe('parsed');
      } else {
        expect(result.status).toBe('unknown');
      }

      /*
       * Snapshot only the interpretation. The entire original input remains
       * in its own JSON file and is protected by the manifest's content hash.
       */
      const { raw: _raw, ...interpretation } = result;

      const expected: typeof interpretation = JSON.parse(
        readFileSync(new URL(entry.file, expectedDirectory), 'utf8'),
      );

      expect(interpretation).toEqual(expected);
      expect(normalizeCommand((raw as { cmd: string }).cmd)).toBe(entry.command);
    });
  }
});
