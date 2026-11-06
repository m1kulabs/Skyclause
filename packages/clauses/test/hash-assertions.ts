import { canonicalHash } from '../src/index'
import { canonicalVectors } from './canonical-vectors'
import { sha256 } from '../src/sha256'
import { sha256Vectors } from './sha256-vectors'

function equal(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`)
}

function rejects(value: unknown, name: string): void {
  try {
    canonicalHash(value)
  } catch (error) {
    if (error instanceof TypeError) return
    throw new Error(`${name}: expected TypeError, got ${error}`)
  }
  throw new Error(`${name}: expected TypeError`)
}

export function runHashAssertions(): { canonical: number; sha256: number; rejected: number } {
  for (const { name, value, digest } of canonicalVectors) {
    equal(canonicalHash(value), digest, name)
    equal(/^[0-9a-f]{64}$/.test(canonicalHash(value)), true, `${name} synchronous lowercase hex`)
  }
  for (const { name, hex, digest } of sha256Vectors) {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
    const before = bytes.slice()
    equal(sha256(bytes), digest, name)
    equal(
      bytes.every((byte, index) => byte === before[index]),
      true,
      `${name} input unchanged`
    )
  }

  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const arrayCycle: unknown[] = []
  arrayCycle.push(arrayCycle)
  class NonJson {
    a = 1
  }
  const sparse = [1, 2, 3]
  delete sparse[1]
  const invalid = [
    undefined,
    () => 0,
    Symbol('value'),
    1n,
    NaN,
    Infinity,
    -Infinity,
    '\ud800',
    '\udc00',
    'a\ud800b',
    '\ud800\ud800',
    '\udc00\ud800',
    '😀\ud800',
    { '\ud800': 1 },
    { nested: { bad: undefined } },
    [undefined],
    [() => 0],
    [Symbol()],
    { member: Symbol('value') },
    { bad: 1n },
    { bad: NaN },
    { bad: '\udc00' },
    new Array(1),
    sparse,
    Object.assign(new Array(1), { extra: 1 }),
    new Date(0),
    /json/,
    new Map(),
    new Set(),
    new Uint8Array([1]),
    new Number(1),
    new String('x'),
    new NonJson(),
    Object.create({ inherited: 1 }),
    cycle,
    arrayCycle,
    { nested: cycle }
  ]
  invalid.forEach((value, index) => rejects(value, `invalid JSON value ${index}`))

  const shared = Object.freeze({ b: 2, a: 1 })
  const value = Object.freeze({ z: Object.freeze([shared, shared]), a: shared })
  const before = JSON.stringify(value)
  // This fixed value hashes {"a":{"a":1,"b":2},"z":[{"a":1,"b":2},{"a":1,"b":2}]}.
  equal(
    canonicalHash(value),
    'a2282f1760801d6c39995161585ad12477ea1e3c4dbe203aa3f87c9e8bc06ddd',
    'frozen shared acyclic references'
  )
  equal(JSON.stringify(value), before, 'input member/array order unchanged')
  equal(
    canonicalHash(Object.assign(Object.create(null), { b: 2, a: 1 })),
    '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    'null prototype'
  )
  const symbolMetadata = { b: 2, a: 1, [Symbol('metadata')]: 1n }
  const nonEnumerableMetadata = Object.defineProperty({ b: 2, a: 1 }, 'metadata', { value: Symbol('value') })
  for (const [name, object] of [
    ['symbol-keyed metadata', symbolMetadata],
    ['non-enumerable metadata', nonEnumerableMetadata]
  ] as const) {
    equal(canonicalHash(object), '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777', `ignored ${name}`)
  }
  return { canonical: canonicalVectors.length + 4, sha256: sha256Vectors.length, rejected: invalid.length }
}
