import { LiveClient } from './client/client';
import { ConnectionError } from './client/errors';
import type { ClientOptions, LiveSessionOptions } from './client/types';
import { observeElectron } from './electron-session';
import type { ElectronWebContents } from './electron-session';
import { parseRawJson } from './parser/json';
import { decodePackets } from './protocol';

export type { ElectronWebContents } from './electron-session';

export interface ElectronClientOptions extends Pick<
  ClientOptions,
  'roomId' | 'observeShapes' | 'reconnect'
> {
  webContents: ElectronWebContents;
  matchesUrl?: (url: string) => boolean;
}

export function createElectronClient(options: ElectronClientOptions): LiveClient {
  const { webContents, matchesUrl = isBilibiliLiveSocket, ...clientOptions } = options;

  return new LiveClient({ reconnect: false, ...clientOptions }, async session => {
    await observeElectron(webContents, {
      signal: session.signal,
      matchesUrl,
      onReady: session.onReady,
      onDisconnected: session.onDisconnected,
      onFrame: payload => readFrame(payload, session),
    }).catch(error => {
      throw new ConnectionError(error instanceof Error ? error.message : 'Electron session failed');
    });
  });
}

function isBilibiliLiveSocket(input: string): boolean {
  const url = URL.parse(input);

  return (
    url?.protocol === 'wss:' &&
    url.hostname.endsWith('.chat.bilibili.com') &&
    url.pathname === '/sub'
  );
}

function readFrame(base64: string, session: LiveSessionOptions): void {
  try {
    if (base64.length > Math.ceil((16 * 1024 * 1024) / 3) * 4) {
      throw new Error('WebSocket message exceeds the size limit');
    }

    for (const { operation, body } of decodePackets(Buffer.from(base64, 'base64'))) {
      if (session.signal.aborted) {
        break;
      }

      switch (operation) {
        case 8: {
          if (JSON.parse(body.toString()).code === 0) {
            session.onConnected();
          }

          break;
        }

        case 3: {
          session.onConnected();
          session.onHeartbeat(body.readUInt32BE(0));

          break;
        }

        case 5: {
          session.onConnected();
          session.onMessage(parseRawJson(body.toString()));

          break;
        }
      }
    }
  } catch {
    session.onError(new ConnectionError('Failed to decode a WebSocket packet'));
  }
}
