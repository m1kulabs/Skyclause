import {
  check,
  evaluate,
  snapshotAt,
  type Check,
  type Evaluate,
  type IndicatorRegistry,
  type Instant,
  type ReadingHistory,
  type SnapshotAt
} from '@skyclause/clauses'
import type { ForecastSource, TxHandle } from '@skyclause/contracts'

/**
 * What the graders evaluate with (#161's inputs): #131's `snapshotAt`, `check` and `evaluate`; #133's stored reading
 * history; the adapters' indicator registry; and #127's `ForecastSource`. The last three aren't built, so they start
 * unset and a composition root sets them with `setGradeEngine`; until then each job refuses, naming what's missing.
 */
export interface GradeEngine {
  registry: IndicatorRegistry | null
  history: ((tx: TxHandle, q: { projectId: string; from: Instant; to: Instant }) => Promise<ReadingHistory>) | null
  forecast: Pick<ForecastSource, 'exits' | 'baseline'> | null
  snapshotAt: SnapshotAt
  check: Check
  evaluate: Evaluate
}

let engine: GradeEngine = { registry: null, history: null, forecast: null, snapshotAt, check, evaluate }

export const gradeEngine = () => engine

export function setGradeEngine(parts: Partial<GradeEngine>) {
  engine = { ...engine, ...parts }
}

const OWNERS = {
  registry: 'the indicator registry (packages/sources)',
  history: 'the reading history (#133)',
  forecast: 'ForecastSource (#127)'
} as const

/** The engine with `parts` checked present, or an error naming each missing one. */
export function requireEngine<K extends keyof typeof OWNERS>(e: GradeEngine, job: string, parts: K[]) {
  const missing = parts.filter((part) => e[part] === null)
  if (missing.length) {
    throw new Error(`${job} needs ${missing.map((part) => OWNERS[part]).join(' and ')}, not yet set by setGradeEngine`)
  }
  return e as GradeEngine & { [P in K]: NonNullable<GradeEngine[P]> }
}
