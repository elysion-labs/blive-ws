import { byc } from '@byc/vp-config';

export default byc(
  {
    run: {
      tasks: {
        capture: {
          command: 'bun scripts/capture.ts',
          cache: false,
        },
        'capture:anonymous': {
          command: 'bun scripts/capture.ts --anonymous',
          cache: false,
        },
      },
    },
    fmt: {
      ignorePatterns: ['src/testing/live/**', 'src/testing/expected/**'],
    },
    pack: {
      entry: {
        index: 'src/index.ts',
        parser: 'src/parser/index.ts',
        protocol: 'src/protocol.ts',
      },
      platform: 'node',
      format: 'esm',
      dts: { tsconfig: 'tsconfig.build.json' },
      sourcemap: true,
      clean: true,
    },
  },
  { stylistic: true },
);
