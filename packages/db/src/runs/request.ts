import { log } from '@skyclause/config'
import type { Pack, RequestRun } from '@skyclause/contracts'
import { and, arrayContains, eq, or, sql } from 'drizzle-orm'
import { afterCommit, type Tx } from '../client'
import { projectGate } from '../gate'
import { run } from '../schema'

// #151 c-run-orchestrator, #79 §1 requestRun: every trigger becomes at most one run per project and pack. Its run is
// published to Pub/Sub `runs-requested` after commit; the 15-minute batch republishes what that missed (D45).

export const RUNS_REQUESTED = 'runs-requested'

/** Publishes one `{run_id, org_id}` message to `runs-requested`; the composition root injects the real one. */
export type RunPublisher = (message: { run_id: string; org_id: string }) => Promise<void>

let publisher: RunPublisher | null = null

/** Sets the publisher requestRun, finishing runs and the republish use; `null` unsets it (tests). */
export function setRunPublisher(next: RunPublisher | null) {
  publisher = next
}

export function runPublisher(): RunPublisher | null {
  return publisher
}

/** After `tx` commits, publishes the run; a failed publish is left to the batch's republish of queued runs. */
export function publishRun(tx: Tx, runId: string) {
  const orgId = tx.orgId!
  afterCommit(tx, async () => {
    if (!publisher) return
    try {
      await publisher({ run_id: runId, org_id: orgId })
    } catch (error) {
      log.warn('run publish failed; the batch republishes it', { run_id: runId, error: String(error) })
    }
  })
}

/** requestRun's refusal for a project that isn't `open` (PRJ-8, D36): no run is written. */
export class RunRefused extends Error {
  constructor(readonly gate: 'archived' | 'suspended') {
    super(`The project is ${gate}, so it starts no runs.`)
    this.name = 'RunRefused'
  }
}

/** Takes the project and pack's run lock until commit: requests, coalescing and claims take turns. */
export async function lockRuns(tx: Tx, projectId: string, pack: Pack) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`run:${projectId}:${pack}`}, 0))`)
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

/** Unions a trigger's windows and nights into a queued run, and keeps its dedupe key when it was coalesced. */
async function merge(
  tx: Tx,
  row: typeof run.$inferSelect,
  add: { windowIds: string[]; nightIds: string[] },
  key?: string
) {
  await tx
    .update(run)
    .set({
      windowIds: union(row.windowIds, add.windowIds),
      nightIds: union(row.nightIds, add.nightIds),
      ...(key ? { coalescedKeys: union(row.coalescedKeys, [key]) } : {}),
      updatedAt: sql`now()`
    })
    .where(eq(run.id, row.id))
}

/**
 * The runs a dedupe key names, as their own key or coalesced into them (at most one per project and pack); with
 * `scope`, only that project and pack's, so a key reused elsewhere never names another project's run.
 */
export function runsServing(tx: Tx, key: string, scope?: { projectId: string; pack: Pack }) {
  const named = or(eq(run.dedupeKey, key), arrayContains(run.coalescedKeys, [key]))
  return tx
    .select()
    .from(run)
    .where(scope ? and(named, eq(run.projectId, scope.projectId), eq(run.pack, scope.pack)) : named)
}

/**
 * #79 §1, in the caller's `withTenant` transaction. Unless `projectGate` is `open` it throws `RunRefused`. A dedupe key
 * seen before, as a run's own or coalesced into it, returns that run. Otherwise the project and pack's one queued run
 * takes the trigger (its windows and nights unioned in, `coalescedInto` set), or a new queued run is written and
 * published after commit.
 */
export const requestRun: RequestRun = async (handle, r) => {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('requestRun needs a withTenant transaction')
  const gate = await projectGate(tx, r.projectId)
  if (gate !== 'open') throw new RunRefused(gate)
  await lockRuns(tx, r.projectId, r.pack)
  const add = { windowIds: r.windowIds ?? [], nightIds: r.nightIds ?? [] }

  const [seen] = await runsServing(tx, r.dedupeKey)
  if (seen) {
    if (seen.status === 'queued') await merge(tx, seen, add)
    return seen.dedupeKey === r.dedupeKey ? { runId: seen.id } : { runId: seen.id, coalescedInto: seen.id }
  }

  const [queued] = await tx
    .select()
    .from(run)
    .where(and(eq(run.projectId, r.projectId), eq(run.pack, r.pack), eq(run.status, 'queued')))
  if (queued) {
    await merge(tx, queued, add, r.dedupeKey)
    return { runId: queued.id, coalescedInto: queued.id }
  }

  const by = r.requestedBy
  const [created] = await tx
    .insert(run)
    .values({
      orgId: tx.orgId,
      projectId: r.projectId,
      pack: r.pack,
      trigger: r.trigger,
      triggerRef: r.triggerRef ?? null,
      dedupeKey: r.dedupeKey,
      windowIds: add.windowIds,
      nightIds: add.nightIds,
      requestedBy: by ? { kind: by.kind, account_id: 'accountId' in by ? by.accountId : null } : null,
      triggeredAt: new Date(r.triggeredAt)
    })
    .returning({ id: run.id })
  publishRun(tx, created!.id)
  return { runId: created!.id }
}
