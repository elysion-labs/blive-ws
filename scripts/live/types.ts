import type { ClientOptions, CookieSource } from '../../src/client/types';

export type CaptureAuthentication = 'authenticated' | 'anonymous';

export interface CaptureEntry {
  file: string;
  command: string;
  roomId: number;
  authentication?: CaptureAuthentication;
  /** Why a reviewed sample adds regression coverage. */
  purpose: string;
  /** Local JSONL segment and one-based line used for a reviewed import. */
  source?: CaptureSource;
  liveStartTime?: number;
  capturedAt: string;
  sha256: string;
}

export interface CaptureSource {
  file: string;
  line: number;
}

export interface CaptureManifest {
  version: 1;
  source: 'bilibili-live-websocket';
  entries: CaptureEntry[];
}

export interface CaptureOptions {
  cookie?: CookieSource;
  authentication: CaptureAuthentication;
  roomId: number;
  /** Zero keeps collecting until the signal is aborted. */
  seconds: number;
  signal: AbortSignal;
  onMessage: (record: CaptureRecord) => void;
  onError?: (error: Error) => void;
  clientOptions?: Omit<ClientOptions, 'roomId' | 'cookie'>;
}

export interface CaptureRecord {
  version: 1;
  receivedAt: string;
  roomId: number;
  authentication: CaptureAuthentication;
  raw: unknown;
}

export interface CaptureResult {
  requestedRoomId: number;
  resolvedRoomId: number | null;
  received: number;
}

export interface JsonlWriterOptions {
  directory: string;
  maxBytes: number;
  forbiddenValues?: readonly string[];
}

export interface JsonlWriterStatus {
  records: number;
  files: number;
  bytes: number;
  currentFile: string | null;
}

export interface CaptureCliOptions {
  authentication: CaptureAuthentication;
  cookie?: string;
  seconds: number;
  maxBytes: number;
  directory: string;
  roomIds?: number[];
}
