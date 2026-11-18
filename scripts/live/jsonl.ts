import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { stringifyRawJson } from '../../src/parser/json';
import type { CaptureRecord, JsonlWriterOptions, JsonlWriterStatus } from './types';

/** Writes each record before returning; no message queue or growing hash set. */
export class JsonlWriter {
  private descriptor: number | null = null;
  private partBytes = 0;
  private nextPart = 1;
  private closed = false;
  private readonly status: JsonlWriterStatus = {
    records: 0,
    files: 0,
    bytes: 0,
    currentFile: null,
  };

  constructor(private readonly options: JsonlWriterOptions) {
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) {
      throw new TypeError('maxBytes must be a positive safe integer');
    }

    mkdirSync(options.directory, { recursive: true });
  }

  write(record: CaptureRecord): void {
    if (this.closed) {
      throw new Error('JSONL writer is closed');
    }

    const text = stringifyRawJson(record, 0);

    if (this.options.forbiddenValues?.some(value => value.length > 0 && text.includes(value))) {
      throw new Error('Credential appeared in a broadcast payload');
    }

    const line = Buffer.from(`${text}\n`, 'utf8');

    if (
      this.descriptor !== null &&
      this.partBytes > 0 &&
      this.partBytes + line.length > this.options.maxBytes
    ) {
      this.closePart();
    }

    if (this.descriptor === null) {
      this.openPart();
    }

    let offset = 0;

    while (offset < line.length) {
      const written = writeSync(this.descriptor!, line, offset, line.length - offset);

      if (written === 0) {
        throw new Error('JSONL write made no progress');
      }

      offset += written;
    }

    this.partBytes += line.length;
    this.status.bytes += line.length;
    this.status.records++;
  }

  getStatus(): JsonlWriterStatus {
    return { ...this.status };
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.closePart();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  private openPart(): void {
    while (this.descriptor === null) {
      const file = join(
        this.options.directory,
        `events-${String(this.nextPart++).padStart(6, '0')}.jsonl`,
      );

      try {
        // A restart or another recorder must not overwrite an existing segment or its tail.
        this.descriptor = openSync(file, 'ax');
        this.status.currentFile = file;
        this.status.files++;
        this.partBytes = 0;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  private closePart(): void {
    if (this.descriptor === null) {
      return;
    }

    const descriptor = this.descriptor;
    this.descriptor = null;

    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
}
