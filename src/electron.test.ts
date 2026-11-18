import { expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';

import { createElectronClient } from './electron';
import { encodePacket } from './protocol';
import danmu from './testing/synthetic/DANMU_MSG.json';

class DebuggerStub extends EventEmitter {
  private attached = false;
  readonly commands: string[] = [];

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.attached = false;
    this.emit('detach', {}, 'target closed');
  }

  isAttached(): boolean {
    return this.attached;
  }

  async sendCommand(method: string): Promise<void> {
    this.commands.push(method);
  }

  notify(method: string, params: unknown): void {
    this.emit('message', {}, method, params, '');
  }
}

it('reuses the live client for read-only Electron monitoring and page reconnects', async () => {
  const debuggerSession = new DebuggerStub();
  const client = createElectronClient({ roomId: 42, webContents: { debugger: debuggerSession } });
  const event = mock();
  client.on('event', event);

  await client.start();
  expect(client.getStatus().status).toBe('connecting');
  expect(debuggerSession.commands).toEqual(['Network.enable']);

  const payloadData = encodePacket(5, JSON.stringify(danmu)).toString('base64');
  const response = { opcode: 2, payloadData };
  debuggerSession.notify('Network.webSocketFrameReceived', { requestId: 'unknown', response });
  expect(event).not.toHaveBeenCalled();

  const url = 'wss://broadcastlv.chat.bilibili.com/sub';
  debuggerSession.notify('Network.webSocketCreated', { requestId: 'first', url });
  debuggerSession.notify('Network.webSocketFrameReceived', { requestId: 'first', response });
  expect(client.getStatus().status).toBe('connected');
  expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: 'message' }));

  debuggerSession.notify('Network.webSocketClosed', { requestId: 'first' });
  expect(client.getStatus().status).toBe('connecting');
  debuggerSession.notify('Network.webSocketCreated', { requestId: 'second', url });
  debuggerSession.notify('Network.webSocketFrameReceived', { requestId: 'second', response });
  expect(event).toHaveBeenCalledTimes(2);

  await client.stop();
  expect(debuggerSession.isAttached()).toBe(false);
  expect(debuggerSession.listenerCount('message')).toBe(0);
});
