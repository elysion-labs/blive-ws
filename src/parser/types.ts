import type { BiliEvent, KnownCommand } from './events';

export type RawMessage = Record<string, unknown> & { cmd: string };

export interface ParseContext {
  /** Resolved real room ID, not a display short ID. Standalone parsing performs no lookup. */
  roomId?: number;
}

export interface ValidationIssue {
  /** JSON pointer into the original input. */
  path: string;
  expected: string;
  actual: string;
}

export interface ParsedResult {
  status: 'parsed';
  command: KnownCommand;
  raw: RawMessage;
  event: BiliEvent;
  /** Every normalized event; one protobuf message can contain several gifts. */
  events: BiliEvent[];
}

export interface UnknownCommandResult {
  status: 'unknown';
  command: string;
  raw: RawMessage;
}

export interface SchemaMismatchResult {
  status: 'mismatch';
  command: string | null;
  raw: unknown;
  issues: ValidationIssue[];
}

export type ParseResult = ParsedResult | UnknownCommandResult | SchemaMismatchResult;

export type ValueType = 'null' | 'boolean' | 'number' | 'string' | 'object' | 'array';

export interface ShapeChange {
  kind: 'fieldAdded' | 'typeChanged';
  path: string;
  previousTypes: ValueType[];
  observedType: ValueType;
}

export interface SchemaChangeDiagnostic {
  command: string;
  raw: RawMessage;
  changes: ShapeChange[];
  /** True when the sample exceeded a shape traversal limit. */
  truncated: boolean;
}

export interface ShapeOptions {
  maxCommands?: number;
  maxPaths?: number;
  maxDepth?: number;
  maxArrayItems?: number;
}

export interface ParserOptions extends ParseContext {
  /** Opt-in, observational comparison against previous messages in this instance. */
  observeShapes?: boolean | ShapeOptions;
}

export interface ParserEventMap {
  raw: unknown;
  event: BiliEvent;
  unknownCommand: UnknownCommandResult;
  schemaMismatch: SchemaMismatchResult;
  schemaChange: SchemaChangeDiagnostic;
}

export interface ParserStatus {
  received: number;
  parsed: number;
  unknown: number;
  mismatched: number;
  schemaChanges: number;
  observedCommands: number;
  truncatedShapes: number;
  lastDiagnostic: {
    type: 'unknownCommand' | 'schemaMismatch' | 'schemaChange';
    command: string | null;
  } | null;
}

export interface EventParser {
  parse(input: unknown, context?: ParseContext): ParseResult;
  /** Synchronous subscriptions. The returned function unsubscribes this handler. */
  on<K extends keyof ParserEventMap>(
    name: K,
    handler: (value: ParserEventMap[K]) => void,
  ): () => void;
  getStatus(): ParserStatus;
  /** Clear observed shapes without resetting lifetime counters. */
  resetShapes(): void;
}
