import { describe, expect, it } from 'bun:test';
import { brotliCompressSync, deflateSync } from 'node:zlib';

import { decodePackets, encodePacket } from './protocol';

function compressed(version: number, data: Buffer): Buffer {
  const payload = version === 2 ? deflateSync(data) : brotliCompressSync(data);
  const result = encodePacket(5);
  result.writeUInt16BE(version, 6);
  result.writeUInt32BE(16 + payload.length, 0);

  return Buffer.concat([result, payload]);
}

describe('live capture packet framing', () => {
  it('decodes multiple packets without truncating the second message', () => {
    const first = encodePacket(5, '{"cmd":"LIVE"}');
    const second = encodePacket(8, '{"code":0}');
    expect(
      decodePackets(Buffer.concat([first, second])).map(packet => ({
        operation: packet.operation,
        body: packet.body.toString(),
      })),
    ).toEqual([
      { operation: 5, body: '{"cmd":"LIVE"}' },
      { operation: 8, body: '{"code":0}' },
    ]);
  });

  it.each([2, 3])('decodes protocol version %i compressed batches', version => {
    const data = Buffer.concat([encodePacket(5, 'one'), encodePacket(5, 'two')]);
    expect(decodePackets(compressed(version, data)).map(packet => packet.body.toString())).toEqual([
      'one',
      'two',
    ]);
  });

  it('rejects incomplete and zero-length packets', () => {
    expect(() => decodePackets(Buffer.alloc(15))).toThrow('header');
    expect(() => decodePackets(Buffer.alloc(16))).toThrow('length');
    expect(() => decodePackets(encodePacket(5, 'body').subarray(0, 18))).toThrow('length');
  });

  it('bounds recursive compression nesting', () => {
    let data = encodePacket(5, 'message');

    for (let index = 0; index < 6; index++) {
      data = compressed(3, data);
    }

    expect(() => decodePackets(data)).toThrow('nesting');
  });
});
