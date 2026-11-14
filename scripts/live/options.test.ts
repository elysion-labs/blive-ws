import { describe, expect, it } from 'bun:test';

import { resolveCaptureOptions } from './options';

describe('JSONL capture configuration', () => {
  it('defaults to continuous monitoring and ignores credentials in anonymous mode', () => {
    const options = resolveCaptureOptions(
      { BILI_COKKIES: 'SESSDATA=unused-test-secret', BILI_ROOM_IDS: '6,732,6' },
      ['--anonymous'],
    );

    expect(options).toMatchObject({
      authentication: 'anonymous',
      cookie: undefined,
      seconds: 0,
      maxBytes: 64 * 1024 * 1024,
      roomIds: [6, 732],
    });
  });

  it.each([
    ['BILI_CAPTURE_SECONDS', '-1'],
    ['BILI_CAPTURE_SECONDS', '1.5'],
    ['BILI_CAPTURE_SECONDS', '2147484'],
    ['BILI_CAPTURE_MAX_BYTES', '0'],
    ['BILI_ROOM_IDS', '6,'],
  ])('rejects invalid %s=%s before creating a recorder', (name, value) => {
    expect(() => resolveCaptureOptions({ [name]: value }, ['--anonymous'])).toThrow(name);
  });
});
