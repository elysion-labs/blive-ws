import { shapeLimits, tuplePaths } from './constants';
import type { ShapeChange, ShapeOptions, ValueType } from './types';
import { pointerPart, valueType } from './validation';

type Shape = Map<string, Set<ValueType>>;

interface ShapeSample {
  shape: Shape;
  truncated: boolean;
}

interface ShapeObservation {
  changes: ShapeChange[];
  truncated: boolean;
}

function optionsWithLimits(options: ShapeOptions): Required<ShapeOptions> {
  const limits = { ...shapeLimits, ...options };

  for (const [key, limit] of Object.entries(limits)) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError(`observeShapes.${key} must be a positive safe integer`);
    }
  }

  if (limits.maxDepth > 64) {
    throw new RangeError('observeShapes.maxDepth must not exceed 64');
  }

  return limits;
}

function shapeType(value: unknown): ValueType | null {
  const type = valueType(value);

  if (
    type === 'null' ||
    type === 'array' ||
    type === 'object' ||
    type === 'string' ||
    type === 'number' ||
    type === 'boolean'
  ) {
    return type;
  }

  return null;
}

class ShapeSampler {
  readonly shape: Shape = new Map();
  truncated = false;
  private readonly ancestors = new Set<object>();
  private remaining: number;

  constructor(
    private readonly limits: Required<ShapeOptions>,
    private readonly tuples: ReadonlySet<string>,
  ) {
    this.remaining = limits.maxPaths * limits.maxArrayItems;
  }

  visit(value: unknown, path: string, depth: number): void {
    if (--this.remaining < 0 || depth > this.limits.maxDepth) {
      this.truncated = true;

      return;
    }

    const type = shapeType(value);

    if (!type || !this.addType(path, type)) {
      this.truncated = true;

      return;
    }

    if (typeof value !== 'object' || value === null) {
      return;
    }

    if (this.ancestors.has(value)) {
      this.truncated = true;

      return;
    }

    this.ancestors.add(value);
    this.visitChildren(value, path, depth);
    this.ancestors.delete(value);
  }

  private addType(path: string, type: ValueType): boolean {
    if (!this.shape.has(path)) {
      if (this.shape.size >= this.limits.maxPaths) {
        return false;
      }

      this.shape.set(path, new Set());
    }

    this.shape.get(path)!.add(type);

    return true;
  }

  private visitChildren(value: object, path: string, depth: number): void {
    if (Array.isArray(value)) {
      const count = Math.min(value.length, this.limits.maxArrayItems);

      if (count < value.length) {
        this.truncated = true;
      }

      for (let index = 0; index < count; index++) {
        if (this.remaining <= 0) {
          this.truncated = true;
          break;
        }

        const slot = this.tuples.has(path) ? index : '*';
        this.visit(value[index], `${path}/${slot}`, depth + 1);
      }

      return;
    }

    for (const key of Object.keys(value)) {
      if (this.remaining <= 0) {
        this.truncated = true;
        break;
      }

      this.visit((value as Record<string, unknown>)[key], `${path}/${pointerPart(key)}`, depth + 1);
    }
  }
}

function mergeTypes(path: string, known: Set<ValueType>, types: Set<ValueType>): ShapeChange[] {
  const changes: ShapeChange[] = [];
  const previousTypes = [...known];
  const hadConcreteType = previousTypes.some(type => type !== 'null');

  for (const type of types) {
    if (known.has(type)) {
      continue;
    }

    known.add(type);

    // A nullable field's first concrete value establishes its type.
    if (type !== 'null' && hadConcreteType) {
      changes.push({ kind: 'typeChanged', path, previousTypes, observedType: type });
    }
  }

  return changes;
}

function mergeShape(previous: Shape, sample: ShapeSample, maxPaths: number): ShapeObservation {
  const changes: ShapeChange[] = [];
  const newSubtrees = new Set<string>();
  let truncated = sample.truncated;

  for (const [path, types] of sample.shape) {
    const knownTypes = previous.get(path);

    if (knownTypes) {
      if (knownTypes.size === 1 && knownTypes.has('null')) {
        newSubtrees.add(path);
      }

      changes.push(...mergeTypes(path, knownTypes, types));
      continue;
    }

    if (previous.size >= maxPaths) {
      truncated = true;
      continue;
    }

    previous.set(path, new Set(types));
    const hasNewParent = [...newSubtrees].some(parent => path.startsWith(`${parent}/`));

    // The first non-empty array sample establishes element structure.
    if (!path.endsWith('/*') && !hasNewParent) {
      changes.push({ kind: 'fieldAdded', path, previousTypes: [], observedType: [...types][0] });
    }

    newSubtrees.add(path);
  }

  return { changes, truncated };
}

/** Bounded LRU of structural unions. Missing optional fields are not removals. */
export class ShapeObserver {
  private readonly limits: Required<ShapeOptions>;
  private readonly commands = new Map<string, Shape>();

  constructor(options: ShapeOptions = {}) {
    this.limits = optionsWithLimits(options);
  }

  get size(): number {
    return this.commands.size;
  }

  clear(): void {
    this.commands.clear();
  }

  observe(command: string, input: unknown): ShapeObservation {
    const sampler = new ShapeSampler(this.limits, tuplePaths.get(command) ?? new Set());
    sampler.visit(input, '', 0);
    const sample = { shape: sampler.shape, truncated: sampler.truncated };
    const previous = this.commands.get(command);

    if (!previous) {
      if (this.commands.size >= this.limits.maxCommands) {
        this.commands.delete(this.commands.keys().next().value!);
      }

      this.commands.set(command, sample.shape);

      return { changes: [], truncated: sample.truncated };
    }

    this.commands.delete(command);
    this.commands.set(command, previous);

    return mergeShape(previous, sample, this.limits.maxPaths);
  }
}
