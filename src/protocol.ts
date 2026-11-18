import { brotliDecompressSync, inflateSync } from 'node:zlib';

export interface Packet {
  operation: number;
  body: Buffer;
}

interface FramedPacket extends Packet {
  length: number;
  version: number;
}

const maxDecodedBytes = 16 * 1024 * 1024;
const maxCompressionDepth = 4;

export function encodePacket(operation: number, body = ''): Buffer {
  const payload = Buffer.from(body);
  const header = Buffer.alloc(16);
  header.writeUInt32BE(16 + payload.length, 0);
  header.writeUInt16BE(16, 4);
  header.writeUInt16BE(1, 6);
  header.writeUInt32BE(operation, 8);
  header.writeUInt32BE(1, 12);

  return Buffer.concat([header, payload]);
}

function readPacket(data: Buffer, offset: number): FramedPacket {
  if (data.length - offset < 16) {
    throw new Error('Truncated packet header');
  }

  const length = data.readUInt32BE(offset);
  const headerLength = data.readUInt16BE(offset + 4);

  if (headerLength < 16 || length < headerLength || offset + length > data.length) {
    throw new Error('Invalid packet length');
  }

  return {
    length,
    version: data.readUInt16BE(offset + 6),
    operation: data.readUInt32BE(offset + 8),
    body: data.subarray(offset + headerLength, offset + length),
  };
}

/** Decode a complete WebSocket message, including compressed packet batches. */
export function decodePackets(input: Buffer): Packet[] {
  const packets: Packet[] = [];
  let decodedBytes = 0;

  function decode(data: Buffer, depth: number): void {
    if (depth > maxCompressionDepth) {
      throw new Error('Packet compression nesting exceeds limit');
    }

    decodedBytes += data.length;

    if (decodedBytes > maxDecodedBytes) {
      throw new Error('Decoded packet bytes exceed limit');
    }

    for (let offset = 0; offset < data.length;) {
      const { length, version, operation, body } = readPacket(data, offset);

      if (version === 2 || version === 3) {
        const options = { maxOutputLength: maxDecodedBytes - decodedBytes };

        const expanded =
          version === 2 ? inflateSync(body, options) : brotliDecompressSync(body, options);

        decode(expanded, depth + 1);
      } else if (version === 0 || version === 1) {
        packets.push({ operation, body });
      } else {
        throw new Error(`Unsupported packet version ${version}`);
      }

      offset += length;
    }
  }

  decode(input, 0);

  return packets;
}
