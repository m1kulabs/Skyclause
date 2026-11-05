// The quarterly restore drill (#117, docs/runbooks/restore.md): branch production's database at
// a point 10 minutes back inside Neon's restore window, time it against RTO 4 hours, walk every
// project's ledger and compare the newest restored write with production's for RPO 5 minutes,
// then delete the branch, whatever happened.
import { log } from '../server'
import type { DrillBranch, NeonClient } from './neon'

const POINT_BACK_MS = 10 * 60_000
const RTO_S = 4 * 3600
const RPO_S = 5 * 60
const PREFIX = 'drill-'
const STOPPED = 'restore drill stopped'

/** #146's `verifyLedger` result. */
export type LedgerVerdict =
  | { ok: true; count: number; head_hash: string }
  | { ok: false; first_bad: { id: string; seq: number; reason: 'seq_gap' | 'prev_hash' | 'hash' } }

/** Reads on one database as the `system` login. */
export interface DrillReads {
  /** Every project, across organisations. */
  projectIds(): Promise<string[]>
  verifyLedger(projectId: string): Promise<LedgerVerdict>
  /** When the newest row written at or before `at` was written, or null when there is none. */
  newestWrite(at: Date): Promise<Date | null>
}

/** packages/db's side of the drill: SQL and connections live there (#79 §1). */
export interface DrillDatabase {
  /** Runs `fn` on the branch compute at `host`, or on production when `host` is null. */
  read<T>(host: string | null, fn: (db: DrillReads) => Promise<T>): Promise<T>
}

export interface DrillRecord {
  /** The restore point, ISO 8601 UTC. */
  point: string
  branch: string
  /** The project's restore window in seconds, read back from Neon. */
  window_s: number
  /** Snapshots the project holds; any would keep deleted data past the window (NFR-14, D45). */
  snapshots: number
  /** Create request to the compute reporting `active` ("running and accepting connections"). */
  ready_s: number
  /** The ledger walk and the newest-write reads on the branch. */
  verified_s: number
  /** `ready_s + verified_s` within 4 hours. */
  rto_ok: boolean
  /** How far the branch's newest write trails production's at or before the point; null unmeasured. */
  rpo_s: number | null
  /** The point minus the branch's newest write: the ticket's literal measure, which idle time inflates. */
  lag_s: number | null
  projects: number
  /** Ledger entries verified across every project. */
  entries: number
  first_bad: { project: string; id: string; seq: number; reason: string } | null
  deleted: boolean
  /** `drill-*` branches left by an earlier run and deleted before this one. */
  swept: number
  /** Present while the database side isn't built. */
  ledger?: string
}

export interface DrillOptions {
  neon: NeonClient
  /** Null until #91's `system` login and #146's `verifyLedger` land. */
  database: DrillDatabase | null
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  /** Aborted on SIGTERM, so the branch is still deleted when Cloud Run stops the task. */
  signal?: AbortSignal
}

const seconds = (ms: number) => Math.round(ms / 100) / 10

const stamp = (point: Date) =>
  point
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

export async function runDrill(options: DrillOptions): Promise<{ record: DrillRecord; misses: string[] }> {
  const { neon, now = Date.now, pollMs = 2000 } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  const window_s = await neon.historyWindowSeconds()
  const point = new Date(Math.floor((now() - POINT_BACK_MS) / 1000) * 1000)
  if (window_s * 1000 <= POINT_BACK_MS) {
    throw new Error(`the ${window_s} s restore window doesn't reach ${point.toISOString()}`)
  }

  const snapshots = await neon.snapshotCount()
  const swept = await neon.branchesNamed(PREFIX)
  for (const branch of swept) await neon.deleteDrillBranch(branch)

  const requested = now()
  const branch = await neon.createDrillBranch(PREFIX + stamp(point), point)
  let measured: Omit<DrillRecord, 'point' | 'branch' | 'window_s' | 'snapshots' | 'deleted' | 'swept'>
  let deleted = false
  try {
    while ((await neon.endpointState(branch.endpointId)) !== 'active') {
      if (options.signal?.aborted) throw new Error(STOPPED)
      if (now() - requested >= RTO_S * 1000)
        throw new Error(`${branch.name} wasn't accepting connections within ${RTO_S} s`)
      await sleep(pollMs)
    }
    const ready_s = seconds(now() - requested)
    const { database } = options
    if (!database) {
      measured = {
        ready_s,
        verified_s: 0,
        rto_ok: ready_s <= RTO_S,
        rpo_s: null,
        lag_s: null,
        projects: 0,
        entries: 0,
        first_bad: null,
        ledger: 'not built (#146)'
      }
    } else {
      const verifying = now()
      const restored = await untilAborted(
        database.read(branch.host, (db) => walk(db, point)),
        options.signal
      )
      const verified_s = seconds(now() - verifying)
      const production = await untilAborted(
        database.read(null, (db) => db.newestWrite(point)),
        options.signal
      )
      measured = {
        ready_s,
        verified_s,
        rto_ok: ready_s + verified_s <= RTO_S,
        // Nothing before the point in production means nothing to lose.
        rpo_s:
          production === null
            ? 0
            : restored.newest === null
              ? null
              : Math.max(0, seconds(production.getTime() - restored.newest.getTime())),
        lag_s: restored.newest === null ? null : seconds(point.getTime() - restored.newest.getTime()),
        projects: restored.projects,
        entries: restored.entries,
        first_bad: restored.firstBad
      }
    }
  } finally {
    deleted = await deleteOrLog(neon, branch)
  }

  const record: DrillRecord = {
    point: point.toISOString(),
    branch: branch.name,
    window_s,
    snapshots,
    ...measured,
    deleted,
    swept: swept.length
  }
  const bad = record.first_bad
  const misses = [
    ...(snapshots ? [`NFR-14: ${snapshots} snapshot(s) would keep deleted data past the restore window`] : []),
    ...(record.rto_ok ? [] : [`RTO: ${record.ready_s + record.verified_s} s is over ${RTO_S} s`]),
    ...(options.database && record.rpo_s === null
      ? ['RPO: the branch holds none of the writes production had before the point']
      : []),
    ...(record.rpo_s !== null && record.rpo_s > RPO_S
      ? [`RPO: the branch trails production by ${record.rpo_s} s, over ${RPO_S} s`]
      : []),
    ...(bad ? [`ledger: project ${bad.project} breaks at entry ${bad.id}, seq ${bad.seq} (${bad.reason})`] : []),
    ...(record.deleted ? [] : [`branch ${branch.id} (${branch.name}) was not deleted`])
  ]
  return { record, misses }
}

/** Walks every project's chain, keeping the first break, then reads the newest restored write. */
async function walk(db: DrillReads, point: Date) {
  const ids = await db.projectIds()
  let entries = 0
  let firstBad: DrillRecord['first_bad'] = null
  for (const project of ids) {
    const verdict = await db.verifyLedger(project)
    if (verdict.ok) entries += verdict.count
    else firstBad ??= { project, ...verdict.first_bad }
  }
  return { projects: ids.length, entries, firstBad, newest: await db.newestWrite(point) }
}

/** Rejects once `signal` aborts, so a hung read can't keep the branch alive past SIGTERM. */
function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new Error(STOPPED))
      signal.addEventListener('abort', () => reject(new Error(STOPPED)), { once: true })
    })
  ])
}

async function deleteOrLog(neon: NeonClient, branch: DrillBranch) {
  try {
    await neon.deleteDrillBranch(branch)
    return true
  } catch (error) {
    log('ERROR', 'restore drill branch not deleted', { branch: branch.id, name: branch.name, error: String(error) })
    return false
  }
}
