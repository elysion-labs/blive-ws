import { InvalidField } from '../validation';
import type { ProtoField } from './types';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maxBytes = 1024 * 1024;

function invalid(expected: string): never {
  throw new InvalidField('/data/pb', expected, 'invalid protobuf');
}

export function decodeBase64(input: string): Uint8Array {
  if (
    input.length === 0 ||
    input.length > (maxBytes * 4) / 3 + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input) ||
    input.length % 4 === 1
  ) {
    return invalid('base64-encoded protobuf of at most 1 MiB');
  }

  try {
    return Uint8Array.from(atob(input), character => character.charCodeAt(0));
  } catch {
    return invalid('valid base64-encoded protobuf');
  }
}

/** Reads the wire types used by this message; unknown numbered fields are retained. */
export class ProtoMessage {
  private offset = 0;
  private readonly fields = new Map<number, ProtoField[]>();

  constructor(private readonly data: Uint8Array) {
    if (data.length > maxBytes) {
      invalid('protobuf of at most 1 MiB');
    }

    while (this.offset < data.length) {
      const tag = this.varint();
      const field = Number(tag >> 3n);
      const wireType = Number(tag & 7n);

      if (field < 1 || field > 0x1fff_ffff) {
        invalid('valid protobuf field number');
      }

      const value = wireType === 0 ? this.varint() : this.bytes(wireType);
      const values = this.fields.get(field) ?? [];
      values.push({ wireType, value });
      this.fields.set(field, values);
    }
  }

  has(field: number): boolean {
    return this.fields.has(field);
  }

  number(field: number, fallback = 0): number {
    const value = this.last(field, 0);

    if (!value) {
      return fallback;
    }

    const result = Number(value.value);

    if (!Number.isSafeInteger(result)) {
      invalid(`safe integer in protobuf field ${field}`);
    }

    return result;
  }

  string(field: number, fallback = ''): string {
    const value = this.last(field, 2);

    if (!value) {
      return fallback;
    }

    try {
      return textDecoder.decode(value.value as Uint8Array);
    } catch {
      return invalid(`UTF-8 string in protobuf field ${field}`);
    }
  }

  message(field: number): ProtoMessage | null {
    const value = this.last(field, 2);

    return value ? new ProtoMessage(value.value as Uint8Array) : null;
  }

  messages(field: number): ProtoMessage[] {
    return (this.fields.get(field) ?? []).map(value => {
      if (value.wireType !== 2) {
        invalid(`length-delimited protobuf field ${field}`);
      }

      return new ProtoMessage(value.value as Uint8Array);
    });
  }

  private last(field: number, wireType: number): ProtoField | undefined {
    const values = this.fields.get(field);

    if (values?.some(value => value.wireType !== wireType)) {
      invalid(`wire type ${wireType} in protobuf field ${field}`);
    }

    return values?.at(-1);
  }

  private varint(): bigint {
    let result = 0n;

    for (let index = 0; index < 10; index++) {
      const byte = this.data[this.offset++];

      if (byte === undefined || (index === 9 && byte > 1)) {
        invalid('complete uint64 protobuf varint');
      }

      result |= BigInt(byte & 0x7f) << BigInt(index * 7);

      if (byte < 0x80) {
        return result;
      }
    }

    return invalid('complete uint64 protobuf varint');
  }

  private bytes(wireType: number): Uint8Array {
    let length: number;

    switch (wireType) {
      case 1: {
        length = 8;
        break;
      }

      case 2: {
        length = Number(this.varint());
        break;
      }

      case 5: {
        length = 4;
        break;
      }

      default: {
        return invalid('supported protobuf wire type (0, 1, 2, 5)');
      }
    }

    if (!Number.isSafeInteger(length) || this.offset + length > this.data.length) {
      invalid('complete protobuf field');
    }

    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;

    return value;
  }
}
