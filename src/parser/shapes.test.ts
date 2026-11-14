import { describe, expect, it } from 'bun:test';

import { ShapeObserver } from './shapes';

describe('ShapeObserver', () => {
  it('ignores optional absence, nullability and array length or item ordering', () => {
    const observer = new ShapeObserver();
    observer.observe('A', { optional: 1, nullable: null, items: [] });
    expect(
      observer.observe('A', { nullable: { name: 'first' }, items: [{ key: 1 }, { key: 'mixed' }] })
        .changes,
    ).toEqual([]);
    expect(
      observer.observe('A', { nullable: null, items: [{ key: 'other' }, { key: 2 }] }).changes,
    ).toEqual([]);
    expect(observer.observe('A', { optional: 2, items: [] }).changes).toEqual([]);
  });

  it('reports changes in array element fields without comparing item positions', () => {
    const observer = new ShapeObserver();
    observer.observe('A', { items: [{ key: 1 }] });
    expect(observer.observe('A', { items: [{ key: 'changed' }] }).changes).toEqual([
      {
        kind: 'typeChanged',
        path: '/items/*/key',
        previousTypes: ['number'],
        observedType: 'string',
      },
    ]);
  });

  it('escapes JSON pointer paths', () => {
    const observer = new ShapeObserver();
    observer.observe('A', { 'a/b~c': 1 });
    expect(observer.observe('A', { 'a/b~c': 'x' }).changes[0]?.path).toBe('/a~1b~0c');
  });

  it('preserves positional fields inside DANMU_MSG tuples', () => {
    const observer = new ShapeObserver();
    observer.observe('DANMU_MSG', { info: [[1, 'text', 25], 'message', [42, 'name']] });

    const result = observer.observe('DANMU_MSG', {
      info: [[1, 'text', 'changed'], 'other', [43, 'other']],
    });

    expect(result.changes).toEqual([
      { kind: 'typeChanged', path: '/info/0/2', previousTypes: ['number'], observedType: 'string' },
    ]);
  });

  it('evicts least recently used commands at the configured limit', () => {
    const observer = new ShapeObserver({ maxCommands: 2 });
    observer.observe('A', { value: 1 });
    observer.observe('B', { value: 1 });
    observer.observe('A', { value: 2 });
    observer.observe('C', { value: 1 });
    expect(observer.size).toBe(2);
    expect(observer.observe('B', { value: 'new baseline' }).changes).toEqual([]);
  });

  it('bounds sampled and remembered paths and flags truncation', () => {
    const observer = new ShapeObserver({ maxPaths: 3, maxDepth: 2, maxArrayItems: 2 });
    expect(observer.observe('A', { items: [1, 2, 3] }).truncated).toBe(true);
    expect(observer.observe('B', { nested: { nested: { nested: true } } }).truncated).toBe(true);
    observer.observe('C', { a: 1 });
    expect(observer.observe('C', { b: 1, c: 1, d: 1 }).truncated).toBe(true);
    expect(observer.observe('C', { d: 1 }).changes).toEqual([]);
  });

  it('handles cycles without recursing forever', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(new ShapeObserver().observe('A', cycle).truncated).toBe(true);
  });

  it.each([{ maxPaths: 0 }, { maxCommands: -1 }, { maxArrayItems: 1.5 }, { maxDepth: 65 }])(
    'rejects invalid limits: %j',
    options => {
      expect(() => new ShapeObserver(options)).toThrow();
    },
  );
});
