import type { ParserEventMap, ParserOptions, ParserStatus } from '../parser/types';

export type Fetcher = (url: string | URL, options?: RequestInit) => Promise<Response>;

export type CookieSource =
  | string
  | ((signal: AbortSignal) => string | null | undefined | Promise<string | null | undefined>);

export type ClientState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'stopped'
  | 'failed'
  | 'disposed';

export interface ReconnectOptions {
  /** Retries after a failed attempt; Infinity by default. */
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  /** Connection health period before resetting the failure counter. */
  healthyAfter?: number;
  /** Fraction of delay randomized on each retry, from 0 to 1. */
  jitter?: number;
}

export interface ClientOptions extends ParserOptions {
  roomId: number;
  cookie?: CookieSource;
  reconnect?: false | ReconnectOptions;
  connectTimeout?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  /** Optional transport hooks, useful for custom networking and local integration tests. */
  fetch?: Fetcher;
  createWebSocket?: (url: string, options: { headers: Record<string, string> }) => WebSocket;
}

export interface ClientStatus {
  id: string;
  roomId: number;
  resolvedRoomId: number | null;
  /** Last platform-reported start time; informational only, never used for event keys. */
  liveStartTime: number | null;
  status: ClientState;
  retryCount: number;
  nextRetryAt: number | null;
  createdAt: number;
  connectedAt: number | null;
  lastMessageAt: number | null;
  lastHeartbeatAt: number | null;
  popularity: number | null;
  lastError: { name: string; message: string; at: number } | null;
  parser: ParserStatus;
}

export interface Heartbeat {
  at: number;
  popularity: number;
}

export interface ClientEventMap extends ParserEventMap {
  statusChange: ClientStatus;
  heartbeat: Heartbeat;
  error: Error;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
}

export interface NavInfo {
  isLogin: boolean;
  mid: number;
  wbi_img: { img_url: string; sub_url: string };
}

export interface DanmuInfo {
  token: string;
  host_list: { host: string; wss_port: number }[];
}

export interface ConnectionInfo {
  roomId: number;
  liveStartTime: number | null;
  url: string;
  auth: {
    uid: number;
    roomid: number;
    protover: number;
    platform: string;
    type: number;
    key: string;
    buvid: string;
  };
}

export interface Packet {
  operation: number;
  body: Buffer;
}

export interface FramedPacket extends Packet {
  length: number;
  version: number;
}

export interface SessionCallbacks {
  onAuthenticated: () => void;
  onMessage: (raw: unknown) => void;
  onHeartbeat: (popularity: number) => void;
}

export interface SessionOptions extends SessionCallbacks {
  connection: ConnectionInfo;
  cookie: string;
  signal: AbortSignal;
  connectTimeout: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  createWebSocket: NonNullable<ClientOptions['createWebSocket']>;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export interface ClientRun {
  controller: AbortController;
  ready: Deferred<void>;
  task: Promise<void>;
}

export interface ResolvedOptions extends Omit<
  ClientOptions,
  | 'reconnect'
  | 'connectTimeout'
  | 'heartbeatInterval'
  | 'heartbeatTimeout'
  | 'fetch'
  | 'createWebSocket'
> {
  reconnect: false | Required<ReconnectOptions>;
  connectTimeout: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  fetch: Fetcher;
  createWebSocket: NonNullable<ClientOptions['createWebSocket']>;
}
