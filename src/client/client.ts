import { createParser } from '../parser/instance';
import { normalizeCommand } from '../parser/parse';
import type { EventParser } from '../parser/types';
import { record } from '../parser/validation';
import { resolveConnection } from './api';
import { abortable, deferred, delay } from './async';
import { Emitter } from './emitter';
import { ConnectionError } from './errors';
import { resolveOptions } from './options';
import { openSession } from './session';
import type {
  ClientEventMap,
  ClientOptions,
  ClientRun,
  ClientState,
  ClientStatus,
  ResolvedOptions,
} from './types';

export class LiveClient {
  private readonly options: ResolvedOptions;
  private readonly parser: EventParser;
  private readonly emitter = new Emitter<ClientEventMap>(() =>
    this.report(new ConnectionError('Event subscriber failed')),
  );
  private readonly state: Omit<ClientStatus, 'parser'>;
  private run: ClientRun | null = null;

  constructor(options: ClientOptions) {
    this.options = resolveOptions(options);
    this.parser = createParser({ roomId: options.roomId, observeShapes: options.observeShapes });
    this.state = {
      id: crypto.randomUUID(),
      roomId: options.roomId,
      resolvedRoomId: null,
      liveStartTime: null,
      status: 'idle',
      retryCount: 0,
      nextRetryAt: null,
      createdAt: Date.now(),
      connectedAt: null,
      lastMessageAt: null,
      lastHeartbeatAt: null,
      popularity: null,
      lastError: null,
    };
    this.parser.on('raw', value => this.emitter.emit('raw', value));
    this.parser.on('event', value => this.emitter.emit('event', value));
    this.parser.on('unknownCommand', value => this.emitter.emit('unknownCommand', value));
    this.parser.on('schemaMismatch', value => this.emitter.emit('schemaMismatch', value));
    this.parser.on('schemaChange', value => this.emitter.emit('schemaChange', value));
  }

  on<K extends keyof ClientEventMap>(
    name: K,
    handler: (value: ClientEventMap[K]) => void | Promise<void>,
  ): () => void {
    return this.emitter.on(name, handler);
  }

  getStatus(): ClientStatus {
    return {
      ...this.state,
      lastError: this.state.lastError ? { ...this.state.lastError } : null,
      parser: this.parser.getStatus(),
    };
  }

  /** Resolves after Bilibili accepts authentication, including initial automatic retries. */
  start(): Promise<void> {
    if (this.state.status === 'disposed') {
      return Promise.reject(new Error('Client is disposed'));
    }

    if (this.run) {
      return this.run.ready.promise;
    }

    const run: ClientRun = {
      controller: new AbortController(),
      ready: deferred<void>(),
      task: Promise.resolve(),
    };

    this.run = run;
    this.state.retryCount = 0;
    this.state.nextRetryAt = null;
    run.task = this.loop(run);

    return run.ready.promise;
  }

  async stop(): Promise<void> {
    const run = this.run;
    this.run = null;
    run?.controller.abort();
    run?.ready.reject(new ConnectionError('Client stopped before authentication completed'));
    this.state.nextRetryAt = null;

    if (this.state.status !== 'disposed') {
      this.changeStatus('stopped');
    }

    await run?.task;
  }

  async restart(): Promise<void> {
    await this.stop();

    return this.start();
  }

  async dispose(): Promise<void> {
    if (this.state.status === 'disposed') {
      return;
    }

    this.changeStatus('disposed');
    await this.stop();
    this.emitter.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  private changeStatus(status: ClientState): void {
    if (this.state.status === status) {
      return;
    }

    this.state.status = status;
    this.emitter.emit('statusChange', this.getStatus());
  }

  private report(error: Error): void {
    this.state.lastError = { name: error.name, message: error.message, at: Date.now() };
    this.emitter.emit('error', error, false);
  }

  private async cookie(signal: AbortSignal): Promise<string> {
    try {
      const source = this.options.cookie;
      const value = typeof source === 'function' ? source(signal) : source;
      const cookie = await abortable(Promise.resolve(value ?? ''), signal);

      if (typeof cookie !== 'string' || /[\r\n]/.test(cookie)) {
        throw new Error('Invalid cookie');
      }

      return cookie;
    } catch {
      // Provider and fetch errors may embed Cookie headers; never forward them.
      throw new ConnectionError('Cookie provider failed or was cancelled');
    }
  }

  private async attempt(run: ClientRun): Promise<void> {
    const signal = run.controller.signal;
    const preparation = AbortSignal.any([signal, AbortSignal.timeout(this.options.connectTimeout)]);
    const cookie = await this.cookie(preparation);

    const connection = await resolveConnection(
      this.options.roomId,
      cookie,
      preparation,
      this.options.fetch,
      this.state.retryCount,
      this.options.parseCookie,
    );

    signal.throwIfAborted();
    this.state.resolvedRoomId = connection.roomId;
    this.state.liveStartTime = connection.liveStartTime;
    let healthyTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      await openSession({
        connection,
        cookie,
        signal,
        connectTimeout: this.options.connectTimeout,
        heartbeatInterval: this.options.heartbeatInterval,
        heartbeatTimeout: this.options.heartbeatTimeout,
        createWebSocket: this.options.createWebSocket,
        onAuthenticated: () => {
          if (signal.aborted) {
            return;
          }

          this.state.connectedAt = Date.now();
          this.state.nextRetryAt = null;
          const reconnect = this.options.reconnect;

          if (reconnect) {
            healthyTimer = setTimeout(() => {
              this.state.retryCount = 0;
            }, reconnect.healthyAfter);
          }

          this.changeStatus('connected');

          if (!signal.aborted) {
            run.ready.resolve();
          }
        },
        onMessage: raw => {
          if (signal.aborted) {
            return;
          }

          this.state.lastMessageAt = Date.now();

          if (
            record(raw) &&
            typeof raw.cmd === 'string' &&
            normalizeCommand(raw.cmd) === 'LIVE' &&
            typeof raw.live_time === 'number' &&
            Number.isSafeInteger(raw.live_time) &&
            raw.live_time > 0
          ) {
            this.state.liveStartTime = raw.live_time;
          }

          this.parser.parse(raw, {
            roomId: connection.roomId,
          });
        },
        onHeartbeat: popularity => {
          if (signal.aborted) {
            return;
          }

          const at = Date.now();
          this.state.lastHeartbeatAt = at;
          this.state.popularity = popularity;
          this.emitter.emit('heartbeat', { at, popularity });
        },
      });
    } finally {
      clearTimeout(healthyTimer);
    }
  }

  private async retry(run: ClientRun, error: unknown): Promise<boolean> {
    if (run.controller.signal.aborted || this.run !== run) {
      return false;
    }

    const failure =
      error instanceof ConnectionError
        ? error
        : new ConnectionError('Connection attempt failed or timed out');

    this.report(failure);

    if (run.controller.signal.aborted || this.run !== run) {
      return false;
    }

    const reconnect = this.options.reconnect;

    if (!reconnect || this.state.retryCount >= reconnect.maxRetries) {
      this.run = null;
      this.changeStatus('failed');
      run.ready.reject(failure);

      return false;
    }

    const exponent = Math.min(this.state.retryCount, 30);
    const baseDelay = Math.min(reconnect.maxDelay, reconnect.initialDelay * 2 ** exponent);
    const ms = Math.max(1, Math.round(baseDelay * (1 - Math.random() * reconnect.jitter)));
    this.state.retryCount++;
    this.state.nextRetryAt = Date.now() + ms;
    this.changeStatus('reconnecting');

    try {
      await delay(ms, run.controller.signal);

      return !run.controller.signal.aborted;
    } catch {
      return false;
    }
  }

  private async loop(run: ClientRun): Promise<void> {
    this.changeStatus('connecting');

    while (!run.controller.signal.aborted) {
      try {
        await this.attempt(run);

        if (run.controller.signal.aborted) {
          return;
        }

        throw new ConnectionError('WebSocket session ended unexpectedly');
      } catch (error) {
        if (!(await this.retry(run, error))) {
          return;
        }
      }
    }
  }
}

export function createClient(options: ClientOptions): LiveClient {
  return new LiveClient(options);
}
