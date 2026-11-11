import {
  canonicalHash,
  type CheckedSheet,
  type IndicatorSnapshot,
  type IndicatorValue,
  type Verdict as EngineVerdict,
  type Window
} from '@skyclause/clauses'
import {
  notBuilt,
  type InputValue,
  type ShadowEvaluator,
  type SnapshotSource,
  type Verdict
} from '@skyclause/contracts'
import { bundle, call, indicatorSnapshot, run, type Tx } from '@skyclause/db'
import type { EvaluatorProviders } from '../evaluator'
import { and, eq } from 'drizzle-orm'

// #153 CAL-9 re-check (ticket decision): a fresh snapshot of the project, the run's pinned sheet version evaluated on
// it, and what changed since drafting in each call's cited inputs and verdict. #133 provides both ports; until it
// registers them at the composition root, an approval fails as not built by `b-evaluator`.

export interface RecheckPorts {
  snapshots: SnapshotSource
  shadow: ShadowEvaluator
  loadCheckedPublishedVersion: EvaluatorProviders['loadCheckedPublishedVersion']
}

let ports: RecheckPorts = {
  snapshots: notBuilt('b-evaluator'),
  shadow: notBuilt('b-evaluator'),
  loadCheckedPublishedVersion: notBuilt('b-evaluator')
}

/** #133 registers its `SnapshotSource` and `ShadowEvaluator` here; tests register doubles. */
export function setRecheckPorts(next: RecheckPorts) {
  ports = next
}

type BundleRow = typeof bundle.$inferSelect
type CallRow = typeof call.$inferSelect

export interface InputChange {
  call_id: string
  before: InputValue
  after: InputValue
}
export interface VerdictChange {
  call_id: string
  before: Verdict
  after: Verdict
}

export interface Recheck {
  snapshotId: string
  snapshot: IndicatorSnapshot
  sheet: CheckedSheet
  /** The fresh verdict of each call's window or night, by call ID. */
  verdicts: Map<string, EngineVerdict>
  /** #499: every fresh window and night verdict, by window or night ID (a drafted missing call's). */
  byScope: Map<string, EngineVerdict>
  changedInputs: InputChange[]
  changedVerdicts: VerdictChange[]
  /** Binds the bundle's content and the differences, on the fields compared only (no ages). */
  diffHash: string
}

/** An engine input as the wire's `InputValue`, with the URL of its first known source. */
export function wireInput(v: IndicatorValue, urls: Map<string, string>): InputValue {
  return {
    name: v.name,
    value: v.value,
    unit: v.unit,
    state: v.state,
    since: v.since,
    age_s: v.ageS === null ? null : Math.round(v.ageS),
    source_ids: v.sourceIds,
    source_url: v.sourceIds.map((id) => urls.get(id)).find(Boolean) ?? null,
    reading_ids: v.readingIds,
    observed_at: v.observedAt
  }
}

export function wireVerdict(v: EngineVerdict, urls: Map<string, string>): Verdict {
  return {
    scope: v.scope,
    pack: v.pack,
    mode: v.mode,
    watch: v.watch,
    no_call: v.noCall
      ? {
          inputs: v.noCall.inputs.map((b) => ({ name: b.name, source_id: b.sourceId, state: b.state, since: b.since }))
        }
      : null,
    recommendations: v.recommendations,
    clauses: v.clauses.map((c) => ({
      key: c.key,
      result: c.result,
      blocked_by: c.blockedBy.map((b) => ({ name: b.name, source_id: b.sourceId, state: b.state, since: b.since })),
      ...(c.span ? { span: c.span } : {}),
      inputs: c.inputs.map((i) => wireInput(i, urls))
    })),
    open_from: v.openFrom
  }
}

/** What CAL-9 compares on an input: its value, state and observation time. */
const inputKey = (i: { value: unknown; state: string; observed_at: string | null }) => ({
  value: i.value,
  state: i.state,
  observed_at: i.observed_at
})

/** What CAL-9 compares on a verdict: the call it makes and the clauses that fired. */
const verdictKey = (v: Verdict) => ({
  mode: v.mode,
  watch: v.watch,
  no_call: v.no_call ? v.no_call.inputs.map((i) => i.name).sort() : null,
  recommendations: [...v.recommendations].sort(),
  fired: v.clauses
    .filter((c) => c.result === 'fired')
    .map((c) => c.key)
    .sort()
})

const same = (a: unknown, b: unknown) => canonicalHash(a) === canonicalHash(b)

/** Whether two verdicts make the same call (CAL-9's comparison, ages and values aside). */
export const sameCall = (a: Verdict, b: Verdict) => same(verdictKey(a), verdictKey(b))

/** The run's pinned sheet version as the engine's checked sheet (CAL-9: the version the bundle was drafted on). */
async function pinnedSheet(tx: Tx, runRow: typeof run.$inferSelect, registryHash: string): Promise<CheckedSheet> {
  if (!runRow.sheetVersionId) throw new Error(`run ${runRow.id} has no pinned sheet version`)
  return (
    await ports.loadCheckedPublishedVersion(tx, {
      projectId: runRow.projectId,
      pack: runRow.pack,
      versionId: runRow.sheetVersionId,
      registryHash
    })
  ).sheet
}

/**
 * Takes a fresh snapshot (persisted), evaluates the run's pinned version on it and compares, per call, each cited
 * input (the agent's `fired` and `no_call` names and the shadow verdict's clause inputs) and the window's or night's
 * verdict with what the run saw.
 */
export async function recheck(
  tx: Tx,
  o: { bundle: BundleRow; calls: CallRow[]; windows: Window[]; urls: Map<string, string>; now: Date }
): Promise<Recheck> {
  const { bundle: b, calls, windows, urls } = o
  const [runRow] = await tx.select().from(run).where(eq(run.id, b.runId))
  if (!runRow) throw new Error(`run ${b.runId} is not visible`)
  const [drafted] = runRow.snapshotId
    ? await tx
        .select({ site: indicatorSnapshot.site })
        .from(indicatorSnapshot)
        .where(eq(indicatorSnapshot.id, runRow.snapshotId))
    : []
  const draftedSite = (drafted?.site ?? {}) as Record<string, IndicatorValue>

  const tEval = o.now.toISOString()
  const taken = await ports.snapshots.take(tx, { projectId: b.projectId, pack: b.pack, tEval, windows, persist: true })
  if (!taken.snapshotId) throw new Error('the snapshot source did not persist the approval’s snapshot')
  const sheet = await pinnedSheet(tx, runRow, taken.snapshot.registryHash)
  const { verdicts } = ports.shadow.evaluate(sheet, taken.snapshot, windows, tEval)

  const fresh = new Map<string, EngineVerdict>()
  const changedInputs: InputChange[] = []
  const changedVerdicts: VerdictChange[] = []
  for (const c of calls) {
    const scoped = c.windowId
      ? verdicts.windows.find((v) => v.scope.id === c.windowId)
      : verdicts.nights.find((v) => v.scope.id === c.nightId)
    if (!scoped) throw new Error(`the evaluator gave no verdict for call ${c.id}`)
    fresh.set(c.id, scoped)
    const before = c.shadow as Verdict
    const after = wireVerdict(scoped, urls)
    if (!same(verdictKey(before), verdictKey(after))) changedVerdicts.push({ call_id: c.id, before, after })

    const cited = new Set([
      ...(c.fired as Array<{ inputs: string[] }>).flatMap((f) => f.inputs),
      ...((c.noCall as string[] | null) ?? []),
      ...before.clauses.flatMap((cl) => cl.inputs.map((i) => i.name))
    ])
    for (const name of cited) {
      const was =
        before.clauses.flatMap((cl) => cl.inputs).find((i) => i.name === name) ??
        (draftedSite[name] ? wireInput(draftedSite[name], urls) : undefined)
      const engine = scoped.clauses.flatMap((cl) => cl.inputs).find((i) => i.name === name) ?? taken.snapshot.site[name]
      const now = engine ? wireInput(engine, urls) : undefined
      if (was && now && !same(inputKey(was), inputKey(now)))
        changedInputs.push({ call_id: c.id, before: was, after: now })
    }
  }
  const diffHash = canonicalHash({
    bundle_id: b.id,
    review_hash: b.reviewHash,
    inputs: changedInputs.map((x) => [x.call_id, x.before.name, inputKey(x.before), inputKey(x.after)]),
    verdicts: changedVerdicts.map((x) => [x.call_id, verdictKey(x.before), verdictKey(x.after)])
  })
  return {
    snapshotId: taken.snapshotId,
    snapshot: taken.snapshot,
    sheet,
    verdicts: fresh,
    byScope: new Map([...verdicts.windows, ...verdicts.nights].flatMap((v) => (v.scope.id ? [[v.scope.id, v]] : []))),
    changedInputs,
    changedVerdicts,
    diffHash
  }
}

const TOKEN = /^recheck\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/

/** The 409's `review_hash`: the fresh snapshot's ID and the difference's hash (ticket decision). */
export const recheckToken = (r: Recheck) => `recheck.${r.snapshotId}.${r.diffHash}`

/**
 * A resubmitted token holds when it names a snapshot of this project and pack and the difference now is the one it
 * was issued for; anything newer answers 409 again with a new token.
 */
export async function confirmedToken(tx: Tx, b: BundleRow, reviewHash: string, r: Recheck) {
  const match = TOKEN.exec(reviewHash)
  if (!match || match[2] !== r.diffHash) return null
  const [seen] = await tx
    .select({ id: indicatorSnapshot.id })
    .from(indicatorSnapshot)
    .where(
      and(
        eq(indicatorSnapshot.id, match[1]!),
        eq(indicatorSnapshot.projectId, b.projectId),
        eq(indicatorSnapshot.pack, b.pack)
      )
    )
  return seen ? { snapshotId: seen.id } : null
}
