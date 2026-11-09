import crowdJson from '../defaults/crowd.json'
import skyJson from '../defaults/sky.json'
import { canonicalHash, check, deriveInputState, diff, evaluate, explain, snapshotAt } from '../src/index'
import { sha256 } from '../src/sha256'
import type { ReadingHistory, SheetInput, Window } from '../src/types'
import { canonicalVectors } from './canonical-vectors'
import { sha256Vectors } from './sha256-vectors'
import { TEST_REGISTRY } from './test-helpers'

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

export function runHashAssertions(): {
  canonical: number
  sha256: number
  rejected: number
  skyContentHash: string
  registryHash: string
  snapshotHash: string
  verdictHash: string
  verdictMode: string | null
} {
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

  // Cross-runtime clause engine parity (check, deriveInputState, snapshotAt, evaluate, explain, diff)
  const skySheet = skyJson as unknown as SheetInput
  const crowdSheet = crowdJson as unknown as SheetInput
  const skyCheck = check(skySheet, TEST_REGISTRY)
  const crowdCheck = check(crowdSheet, TEST_REGISTRY)
  equal(skyCheck.ok && skyCheck.publishable, true, 'sky sheet check publishable')
  equal(crowdCheck.ok && crowdCheck.publishable, true, 'crowd sheet check publishable')

  const tEval = '2026-11-02T07:15:00Z'
  const waveWindow: Window = {
    id: '2026-11-02-w2',
    kind: 'commute_wave',
    startsAt: '2026-11-02T07:30:00Z',
    endsAt: '2026-11-02T07:30:00Z',
    tz: 'Asia/Kuala_Lumpur'
  }
  const history: ReadingHistory = {
    sources: [
      {
        id: 'jps-75',
        kind: 'jps_rain',
        cadenceS: 900,
        staleAfterS: 2700,
        freshness: 'observed',
        probation: false,
        meta: { station: 'Sri Petaling' }
      },
      {
        id: 'apims-cheras',
        kind: 'apims',
        cadenceS: 3600,
        staleAfterS: 7200,
        freshness: 'observed',
        probation: false,
        meta: { station: 'Cheras' }
      },
      {
        id: 'met-warn',
        kind: 'met_warning',
        cadenceS: 900,
        staleAfterS: 3600,
        freshness: 'polled',
        probation: false,
        meta: {}
      },
      {
        id: 'met-fcst',
        kind: 'met_forecast',
        cadenceS: 3600,
        staleAfterS: 21600,
        freshness: 'polled',
        probation: false,
        meta: {}
      }
    ],
    polls: [
      { id: 'p-jps', sourceId: 'jps-75', startedAt: '2026-11-02T07:04:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'p-api', sourceId: 'apims-cheras', startedAt: '2026-11-02T07:05:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'p-warn', sourceId: 'met-warn', startedAt: '2026-11-02T07:10:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'p-fcst', sourceId: 'met-fcst', startedAt: '2026-11-02T06:00:00Z', outcome: 'ok', httpStatus: 200 }
    ],
    readings: [
      {
        id: 'r-jps-1',
        sourceId: 'jps-75',
        metric: 'rain_5m_mm',
        observedAt: '2026-11-02T06:45:00Z',
        receivedAt: '2026-11-02T06:48:00Z',
        value: 19.0,
        valueText: '19.0',
        valueJson: null,
        itemKey: '2026-11-02T06:45:00Z',
        revision: 1
      },
      {
        id: 'r-jps-2',
        sourceId: 'jps-75',
        metric: 'rain_5m_mm',
        observedAt: '2026-11-02T07:00:00Z',
        receivedAt: '2026-11-02T07:04:00Z',
        value: 20.0,
        valueText: '20.0',
        valueJson: null,
        itemKey: '2026-11-02T07:00:00Z',
        revision: 1
      },
      {
        id: 'r-api-0a',
        sourceId: 'apims-cheras',
        metric: 'api',
        observedAt: '2026-10-30T22:00:00Z',
        receivedAt: '2026-10-30T22:05:00Z',
        value: 58,
        valueText: '58',
        valueJson: null,
        itemKey: '2026-10-30T22:00:00Z',
        revision: 1
      },
      {
        id: 'r-api-0b',
        sourceId: 'apims-cheras',
        metric: 'api',
        observedAt: '2026-10-31T22:00:00Z',
        receivedAt: '2026-10-31T22:05:00Z',
        value: 60,
        valueText: '60',
        valueJson: null,
        itemKey: '2026-10-31T22:00:00Z',
        revision: 1
      },
      {
        id: 'r-api-1',
        sourceId: 'apims-cheras',
        metric: 'api',
        observedAt: '2026-11-01T22:00:00Z',
        receivedAt: '2026-11-01T22:05:00Z',
        value: 62,
        valueText: '62',
        valueJson: null,
        itemKey: '2026-11-01T22:00:00Z',
        revision: 1
      },
      {
        id: 'r-api-prev',
        sourceId: 'apims-cheras',
        metric: 'api',
        observedAt: '2026-11-02T06:00:00Z',
        receivedAt: '2026-11-02T06:05:00Z',
        value: 63,
        valueText: '63',
        valueJson: null,
        itemKey: '2026-11-02T06:00:00Z',
        revision: 1
      },
      {
        id: 'r-api-2',
        sourceId: 'apims-cheras',
        metric: 'api',
        observedAt: '2026-11-02T07:00:00Z',
        receivedAt: '2026-11-02T07:05:00Z',
        value: 64,
        valueText: '64',
        valueJson: null,
        itemKey: '2026-11-02T07:00:00Z',
        revision: 1
      },
      {
        id: 'r-warn-1',
        sourceId: 'met-warn',
        metric: 'warning_in_force',
        observedAt: '2026-11-02T06:30:00Z',
        receivedAt: '2026-11-02T06:31:00Z',
        value: true,
        valueText: null,
        valueJson: { validFrom: '2026-11-02T06:30:00Z', validTo: '2026-11-02T09:00:00Z' },
        itemKey: 'warn-1',
        revision: 1
      },
      {
        id: 'r-fcst-1',
        sourceId: 'met-fcst',
        metric: 'afternoon_thunderstorm',
        observedAt: '2026-11-02T06:00:00Z',
        receivedAt: '2026-11-02T06:00:00Z',
        value: true,
        valueText: null,
        valueJson: null,
        itemKey: '2026-11-02',
        revision: 1
      }
    ]
  }

  equal(deriveInputState(history, 'jps-75', tEval), 'fresh', 'deriveInputState jps-75 fresh')

  const snap = snapshotAt(history, TEST_REGISTRY, 'apu-bukit-jalil', 'sky', tEval)
  const verdicts = evaluate(skyCheck.sheet!, snap, [waveWindow], tEval)
  const winVerdict = verdicts.windows[0]!
  equal(winVerdict.mode, 'commute_disruption', 'sky verdict mode commute_disruption')
  equal(winVerdict.watch, true, 'sky verdict watch true')

  const roundTripped = JSON.parse(JSON.stringify(verdicts))
  const explained = explain(roundTripped)
  const stormConfirmed = explained.find((c) => c.key === 'storm_confirmed')!
  equal(stormConfirmed.result, 'fired', 'explained storm_confirmed fired')
  equal(
    stormConfirmed.cel,
    'w.rain_max_60m_mm >= 31.0',
    'explained storm_confirmed cel preserved after JSON round-trip'
  )

  const sheetDiff = diff(skySheet, skySheet)
  equal(sheetDiff.length, 0, 'identical sheet diff is empty')

  return {
    canonical: canonicalVectors.length + 4,
    sha256: sha256Vectors.length,
    rejected: invalid.length,
    skyContentHash: skyCheck.sheet!.contentHash,
    registryHash: skyCheck.sheet!.registryHash,
    snapshotHash: snap.hash,
    verdictHash: verdicts.hash,
    verdictMode: winVerdict.mode
  }
}
