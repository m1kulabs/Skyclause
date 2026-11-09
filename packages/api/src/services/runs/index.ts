import type { Operations, Pack, Principal } from '@skyclause/contracts'
import {
  budgetGate,
  bundle,
  call,
  projectPack,
  requestRun,
  RUN_STEPS,
  run,
  runStep,
  RunRefused,
  window,
  type Tx
} from '@skyclause/db'
import { formatDateTime } from '@skyclause/i18n/format'
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { inScope, normalSummary, visibleProject } from '../bundles'

// #151, #79 §4 c-run-orchestrator: "Ask for a call" and the run reads, `(ctx: {principal, tx}, input)`. A row in
// another organisation, or in a project the principal's grant or link doesn't cover, is 404 (NFR-10).

type Ok<Id extends keyof Operations, S extends number = 200> = Operations[Id] extends {
  responses: { [K in S]: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never
export type RunView = Ok<'getRun'>
type RunRow = typeof run.$inferSelect

const tx = (ctx: ServiceContext) => ctx.tx as Tx
const notFound = () => new ApiError(404, 'not-found', 'No run with this ID.')
const invalid = (pointer: string, detail: string) =>
  new ApiError(422, 'validation-failed', 'The request is invalid.', { errors: [{ in: 'body', pointer, detail }] })

/** The contract's Run; its snapshot, sheet version and verdict hash read '' until the run's steps set them. */
function runView(row: RunRow): Ok<'listRuns'>['data'][number] {
  return {
    id: row.id,
    project_id: row.projectId,
    pack: row.pack,
    trigger: row.trigger,
    dedupe_key: row.dedupeKey,
    sheet_version_id: row.sheetVersionId ?? '',
    snapshot_id: row.snapshotId ?? '',
    model: row.model,
    fallback_used: row.fallbackUsed,
    status: row.status,
    reason: row.reason,
    trigger_ref: row.triggerRef,
    window_ids: row.windowIds,
    verdict_hash: row.verdictHash ?? ''
  }
}

const isGuest = (p: Principal) => p.kind === 'guest_token' || (p.kind === 'session' && p.isGuest)

/** node-postgres' error for a unique index, under Drizzle's wrapper. */
function violates(error: unknown, constraint: string): boolean {
  for (let e = error as { code?: string; constraint?: string; cause?: unknown } | undefined; e; e = e.cause as never) {
    if (e.code === '23505' && e.constraint === constraint) return true
  }
  return false
}

/**
 * `POST /v1/projects/{id}/runs` ("Ask for a call", CAL-1's `request`): a run for the pack and the named windows, or
 * today's. Guests are budgeted here (GST-8: 429 `budget-exhausted` with the reset time in MYT); every run is budgeted
 * again by its own step before drafting (#181). A project that isn't open starts nothing (PRJ-8).
 */
export async function createRun(
  ctx: ServiceContext,
  input: { projectId: string; pack: Pack; windowIds?: string[]; idempotencyKey: string; now: Date }
) {
  await visibleProject(ctx, input.projectId)
  const [pack] = await tx(ctx)
    .select({ enabled: projectPack.enabled })
    .from(projectPack)
    .where(and(eq(projectPack.projectId, input.projectId), eq(projectPack.pack, input.pack)))
  if (!pack?.enabled) throw invalid('/pack', `The ${input.pack} pack is not enabled for this project`)
  const windowIds = [...new Set(input.windowIds ?? [])]
  if (windowIds.length) {
    const found = await tx(ctx)
      .select({ id: window.id })
      .from(window)
      .where(and(inArray(window.id, windowIds), eq(window.projectId, input.projectId), isNull(window.cancelledAt)))
    const known = new Set(found.map((w) => w.id))
    const missing = (input.windowIds ?? []).findIndex((id) => !known.has(id))
    if (missing >= 0) throw invalid(`/window_ids/${missing}`, 'Not an open window of this project')
  }

  if (isGuest(ctx.principal)) {
    const budget = await budgetGate.consume(ctx.tx, ctx.principal, 'run')
    if (!budget.ok) {
      const seconds = Math.max(1, Math.ceil((Date.parse(budget.resetsAt) - input.now.getTime()) / 1000))
      throw new ApiError(
        429,
        'budget-exhausted',
        `No runs are left today. The budget resets at ${formatDateTime(budget.resetsAt, 'en')}.`,
        { resets_at: budget.resetsAt },
        { 'Retry-After': String(seconds) }
      )
    }
  }

  let runId: string
  try {
    ;({ runId } = await requestRun(ctx.tx, {
      projectId: input.projectId,
      pack: input.pack,
      trigger: 'request',
      windowIds,
      requestedBy: ctx.principal,
      dedupeKey: `request:${input.idempotencyKey}`,
      triggeredAt: instant(input.now)
    }))
  } catch (error) {
    if (error instanceof RunRefused) throw new ApiError(422, 'validation-failed', error.message)
    // Another organisation's run already holds this key (dedupe keys are unique across organisations).
    if (violates(error, 'run_dedupe_key_key')) {
      throw new ApiError(422, 'idempotency-mismatch', 'This Idempotency-Key is already in use; send a new one.')
    }
    throw error
  }
  const [row] = await tx(ctx).select().from(run).where(eq(run.id, runId))
  return runView(row!)
}

const Position = z.object({ id: z.string() })

/** `GET /v1/projects/{id}/runs`: newest first (UUIDv7 order). */
export async function listRuns(ctx: ServiceContext, input: { projectId: string; limit: number; cursor?: string }) {
  await visibleProject(ctx, input.projectId)
  const after = input.cursor ? Position.safeParse(decodeCursor(input.cursor)) : null
  if (after && !after.success) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  const rows = await tx(ctx)
    .select()
    .from(run)
    .where(and(eq(run.projectId, input.projectId), after?.success ? lt(run.id, after.data.id) : undefined))
    .orderBy(desc(run.id))
    .limit(input.limit + 1)
  return page(rows.map(runView), input.limit, (view) => ({ id: view.id }))
}

const NO_DRAFT: Record<string, string> = {
  validation: 'validation',
  budget: 'budget',
  provider_error: 'provider error'
}

/** The run's trace line (TRD "No draft: {reason}"; CAL-5's for an all-Normal bundle) and the inputs it cites. */
async function traceOf(ctx: ServiceContext, row: RunRow, bundleId: string | null) {
  if (row.status === 'drafted' && bundleId) {
    const calls = await tx(ctx)
      .select({ mode: call.mode, noCall: call.noCall })
      .from(call)
      .where(eq(call.bundleId, bundleId))
    if (calls.every((c) => c.mode === 'normal' && c.noCall === null)) {
      const summary = await normalSummary(ctx, row)
      if (summary) return summary
    }
    return { text: `Drafted: ${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`, inputs: [] }
  }
  const text =
    row.status === 'no_draft'
      ? `No draft: ${NO_DRAFT[row.reason ?? ''] ?? row.reason}`
      : row.status === 'failed'
        ? `Failed: ${row.reason}`
        : row.status === 'running'
          ? 'Running'
          : 'Queued'
  return { text, inputs: [] }
}

/** `GET /v1/runs/{id}`: the run, the bundle it drafted, and its trace with each recorded step. */
export async function getRun(ctx: ServiceContext, input: { id: string }): Promise<RunView> {
  const [row] = await tx(ctx).select().from(run).where(eq(run.id, input.id))
  if (!row || !inScope(ctx.principal, row.projectId)) throw notFound()
  const [made] = await tx(ctx).select({ id: bundle.id }).from(bundle).where(eq(bundle.runId, row.id)).limit(1)
  const steps = (await tx(ctx).select().from(runStep).where(eq(runStep.runId, row.id))).sort(
    (x, y) => RUN_STEPS.indexOf(x.step as never) - RUN_STEPS.indexOf(y.step as never)
  )
  const trace = await traceOf(ctx, row, made?.id ?? null)
  return {
    ...runView(row),
    triggered_at: instant(row.triggeredAt),
    bundle_id: made?.id ?? null,
    trace: {
      ...trace,
      steps: steps.map((s) => ({
        step: s.step,
        status: s.status,
        started_at: instant(s.startedAt),
        finished_at: s.finishedAt ? instant(s.finishedAt) : null
      }))
    }
  }
}
