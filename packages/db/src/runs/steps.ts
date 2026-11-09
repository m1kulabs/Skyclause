import { and, eq, sql } from 'drizzle-orm'
import { track } from '../analytics'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { run, runStep } from '../schema'
import { lockRuns, publishRun } from './request'

// #151 c-run-orchestrator: the run state machine's queries. A run is `queued`, then `running` while it walks its steps
// (each recorded in `run_step` before the next begins), then `drafted`, `no_draft` or `failed` (TRD architecture).

/** The ticket's steps, in order. */
export const RUN_STEPS = ['snapshot', 'shadow', 'budget', 'draft', 'validate', 'compare', 'persist'] as const
export type RunStepName = (typeof RUN_STEPS)[number]
export type RunRow = typeof run.$inferSelect

/** The trigger events and analytics report: PRD's enum has no `window`, which reads as `calendar`. */
export const reportedTrigger = (trigger: RunRow['trigger']) => (trigger === 'window' ? 'calendar' : trigger)

export type ClaimOutcome = 'missing' | 'finished' | 'busy' | 'started' | 'resumed'

/**
 * Starts a queued run unless its project and pack already have one `running` (then it stays queued: the running run
 * publishes it when it finishes). A `running` run resumes; a finished or missing one does nothing.
 */
export async function claimRun(
  tx: Tx,
  runId: string,
  o: { traceId?: string | null } = {}
): Promise<{ outcome: ClaimOutcome; run?: RunRow }> {
  const [found] = await tx.select({ projectId: run.projectId, pack: run.pack }).from(run).where(eq(run.id, runId))
  if (!found) return { outcome: 'missing' }
  await lockRuns(tx, found.projectId, found.pack)
  const row = await lockRun(tx, runId)
  if (row.status === 'running') return { outcome: 'resumed', run: row }
  if (row.status !== 'queued') return { outcome: 'finished', run: row }
  const [busy] = await tx
    .select({ id: run.id })
    .from(run)
    .where(and(eq(run.projectId, row.projectId), eq(run.pack, row.pack), eq(run.status, 'running')))
  if (busy) return { outcome: 'busy', run: row }
  const [started] = await tx
    .update(run)
    .set({ status: 'running', traceId: o.traceId ?? row.traceId, updatedAt: sql`now()` })
    .where(eq(run.id, runId))
    .returning()
  await track(
    tx,
    'run_started',
    { pack: row.pack, trigger: reportedTrigger(row.trigger) },
    { projectId: row.projectId }
  )
  return { outcome: 'started', run: started! }
}

/** The run's row, locked until commit, so a concurrent delivery of the same run waits and then sees what this did. */
export async function lockRun(tx: Tx, runId: string): Promise<RunRow> {
  const [row] = await tx.select().from(run).where(eq(run.id, runId)).for('update')
  if (!row) throw new Error(`run ${runId} is not visible in this transaction`)
  return row
}

/** The run's recorded steps, by name. */
export async function runSteps(tx: Tx, runId: string) {
  const rows = await tx.select().from(runStep).where(eq(runStep.runId, runId))
  return new Map(rows.map((row) => [row.step as RunStepName, row]))
}

export async function recordStep(
  tx: Tx,
  runId: string,
  step: RunStepName,
  status: 'done' | 'failed',
  output: unknown,
  startedAt: Date
) {
  await tx.insert(runStep).values({
    orgId: tx.orgId!,
    runId,
    step,
    status,
    output: output ?? null,
    startedAt,
    finishedAt: sql`now()`
  })
}

export type RunOutcome = { shadowMode: boolean } & (
  | { status: 'drafted'; bundleId: string }
  | { status: 'no_draft'; reason: 'validation' | 'budget' | 'provider_error' }
  | { status: 'failed'; reason: string }
)

/**
 * Ends a running run: `drafted` emits `run.completed` with the bundle, `no_draft` and `failed` emit `run.failed` with
 * the reason (#79 §5). The project and pack's queued run, if any, is published after commit.
 */
export async function finishRun(tx: Tx, row: RunRow, outcome: RunOutcome) {
  const reason = outcome.status === 'drafted' ? null : outcome.reason
  await tx
    .update(run)
    .set({ status: outcome.status, reason, updatedAt: sql`now()` })
    .where(eq(run.id, row.id))
  const common = {
    run_id: row.id,
    pack: row.pack,
    trigger: reportedTrigger(row.trigger),
    shadow_mode: outcome.shadowMode
  }
  if (outcome.status === 'drafted') {
    await emitEvent(tx, {
      projectId: row.projectId,
      type: 'run.completed',
      data: { ...common, bundle_id: outcome.bundleId }
    })
  } else {
    await emitEvent(tx, { projectId: row.projectId, type: 'run.failed', data: { ...common, reason: outcome.reason } })
  }
  const [next] = await tx
    .select({ id: run.id })
    .from(run)
    .where(and(eq(run.projectId, row.projectId), eq(run.pack, row.pack), eq(run.status, 'queued')))
  if (next) publishRun(tx, next.id)
}
