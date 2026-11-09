import { trace } from '@opentelemetry/api'
import {
  compare,
  draftBundle,
  validate,
  type AgentInput,
  type Comparison,
  type DraftOptions,
  type DraftResult,
  type ProposedBundle,
  type Validation
} from '@skyclause/agent'
import type { CheckedSheet, IndicatorSnapshot, Verdict, Verdicts, Window } from '@skyclause/clauses'
import type { BudgetGate, Instant, ModelResolver, ShadowEvaluator, SnapshotSource } from '@skyclause/contracts'
import {
  aiUsage,
  claimRun,
  createBundle,
  finishRun,
  lockRun,
  recordStep,
  run,
  RUN_STEPS,
  runSteps,
  systemPrincipal,
  window,
  withTenant,
  type CallDraft,
  type ClaimOutcome,
  type RunOutcome,
  type RunRow,
  type RunStepName,
  type Tx
} from '@skyclause/db'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { log } from '../server'
import { agentInput, boundSourceUrls, windowsAtRisk } from './inputs'

// #151 c-run-orchestrator: one run walks the ticket's seven steps (TRD: a Postgres state machine). Each step runs in
// its own transaction that locks the run's row, skips a step already in `run_step`, and records its output before the
// next begins, so a redelivered message resumes at the first unfinished step and never repeats one.

/** The ports a run calls (#79 §1); tests pass doubles, production the owners' implementations. */
export interface RunPorts {
  snapshots: SnapshotSource
  shadow: ShadowEvaluator
  budget: BudgetGate
  models: ModelResolver
  modelFor: DraftOptions['modelFor']
  /** `GCP_PROJECT` and `VERTEX_LOCATION`, for a chain's platform entry (#148); unset, such an entry fails the run. */
  vertex?: DraftOptions['vertex']
  /** The Skyclause origins a notice may link to. */
  origins: string[]
  now: () => Date
}

/** Called after a step commits; tests throw from it to stand for a handler killed there. */
export interface RunHooks {
  afterStep?: (step: RunStepName) => void | Promise<void>
}

export const RUNS_JOB = 'runs'

interface Outputs {
  snapshot: { snapshotId: string | null; snapshot: IndicatorSnapshot; windows: Window[] }
  shadow: { versionId: string; n: number; sheet: CheckedSheet; verdicts: Verdicts; verdictHash: string }
  budget: { ok: true } | { ok: false; resetsAt: Instant }
  draft: { input: AgentInput; result: DraftResult }
  validate: Validation
  compare: Comparison[]
  persist: { bundleId: string; state: string }
}
type Done = Partial<Outputs>
interface StepContext {
  tx: Tx
  run: RunRow
  done: Done
  ports: RunPorts
}
type Step<K extends RunStepName> = (c: StepContext) => Promise<{ output: Outputs[K]; finish?: RunOutcome }>

const need = <K extends RunStepName>(done: Done, step: K): Outputs[K] => {
  const output = done[step]
  if (output === undefined) throw new Error(`step ${step} has no output`)
  return output as Outputs[K]
}

/** D24's input for #155: true when any shadow verdict is No call or a mode above Normal. */
export function shadowMode(done: Done): boolean {
  const verdicts = done.shadow?.verdicts
  if (!verdicts) return false
  return [...verdicts.site, ...verdicts.windows, ...verdicts.nights].some(
    (v) => v.noCall !== null || (v.mode !== null && v.mode !== 'normal')
  )
}

/** The engine's verdict as the wire's `Verdict` (`call.shadow`), each input with its bound source's URL. */
function wireVerdict(v: Verdict, urls: Map<string, string>) {
  const blocked = (b: { name: string; sourceId: string | null; state: string; since: string }) => ({
    name: b.name,
    source_id: b.sourceId,
    state: b.state,
    since: b.since
  })
  return {
    scope: v.scope,
    pack: v.pack,
    mode: v.mode,
    watch: v.watch,
    no_call: v.noCall ? { inputs: v.noCall.inputs.map(blocked) } : null,
    recommendations: v.recommendations,
    clauses: v.clauses.map((c) => ({
      key: c.key,
      result: c.result,
      blocked_by: c.blockedBy.map(blocked),
      ...(c.span ? { span: c.span } : {}),
      inputs: c.inputs.map((i) => ({
        name: i.name,
        value: i.value,
        unit: i.unit,
        state: i.state,
        since: i.since,
        age_s: i.ageS === null ? null : Math.round(i.ageS),
        source_ids: i.sourceIds,
        source_url: i.sourceIds.map((id) => urls.get(id)).find(Boolean) ?? null,
        reading_ids: i.readingIds,
        observed_at: i.observedAt
      }))
    })),
    open_from: v.openFrom
  }
}

const RequestedBy = z.object({ kind: z.string(), account_id: z.string().nullable() }).nullable()

const STEPS: { [K in RunStepName]: Step<K> } = {
  snapshot: async ({ tx, run: r, ports }) => {
    const now = ports.now()
    const windows = await windowsAtRisk(tx, r, now)
    const { snapshotId, snapshot } = await ports.snapshots.take(tx, {
      projectId: r.projectId,
      pack: r.pack,
      tEval: now.toISOString(),
      windows,
      persist: true
    })
    await tx.update(run).set({ snapshotId }).where(eq(run.id, r.id))
    return { output: { snapshotId, snapshot, windows } }
  },

  shadow: async ({ tx, run: r, done, ports }) => {
    const { snapshot, windows } = need(done, 'snapshot')
    const { versionId, n, sheet } = await ports.shadow.loadPublished(tx, r.projectId, r.pack)
    const { verdicts, verdictHash } = ports.shadow.evaluate(sheet, snapshot, windows, snapshot.tEval)
    await tx.update(run).set({ sheetVersionId: versionId, verdictHash }).where(eq(run.id, r.id))
    return { output: { versionId, n, sheet, verdicts, verdictHash } }
  },

  // #181's decision: one `consume(…, 'run')` per run, before drafting, so the Commons model budget sees the day's
  // `ai_usage` tokens. Over budget the run is "No draft: budget" with its shadow verdict kept (TRD budgets).
  budget: async ({ tx, done, ports }) => {
    const output = await ports.budget.consume(tx, systemPrincipal(RUNS_JOB), 'run')
    if (output.ok) return { output }
    return { output, finish: { status: 'no_draft', reason: 'budget', shadowMode: shadowMode(done) } }
  },

  draft: async ({ tx, run: r, done, ports }) => {
    const { snapshot, windows } = need(done, 'snapshot')
    const { sheet } = need(done, 'shadow')
    // A session's own POST runs attended with its account's keys; every other trigger is unattended.
    const requested = RequestedBy.parse(r.requestedBy)
    const chain = await ports.models.chain(tx, {
      orgId: r.orgId,
      accountId: requested?.account_id ?? null,
      unattended: requested?.kind !== 'session'
    })
    const input = await agentInput(tx, { run: r, snapshot, windows, sheet, now: ports.now(), origins: ports.origins })
    const result = await draftBundle(input, {
      chain,
      modelFor: ports.modelFor,
      ...(ports.vertex ? { vertex: ports.vertex } : {})
    })
    // One `ai_usage` row per model call (#148), a provider error's with no tokens.
    if (result.attempts.length) {
      await tx.insert(aiUsage).values(
        result.attempts.map((a) => ({
          orgId: r.orgId,
          runId: r.id,
          aiKeyId: a.keyId,
          model: a.model,
          tokensIn: a.usage.inputTokens ?? 0,
          tokensOut: a.usage.outputTokens ?? 0
        }))
      )
    }
    const last = result.attempts.at(-1)
    await tx
      .update(run)
      .set({
        model: result.ok ? result.model : (last?.model ?? null),
        provider: result.ok ? result.provider : (last?.provider ?? null),
        fallbackUsed: result.ok && result.fallbackUsed,
        tokensIn: result.usage.inputTokens ?? null,
        tokensOut: result.usage.outputTokens ?? null
      })
      .where(eq(run.id, r.id))
    const output = { input, result }
    if (result.ok) return { output }
    return { output, finish: { status: 'no_draft', reason: result.reason, shadowMode: shadowMode(done) } }
  },

  validate: async ({ done }) => {
    const { input, result } = need(done, 'draft')
    if (!result.ok) throw new Error('validate needs a drafted bundle')
    const output = validate(result.bundle, input)
    if (output.ok) return { output }
    return { output, finish: { status: 'no_draft', reason: 'validation', shadowMode: shadowMode(done) } }
  },

  compare: async ({ done }) => {
    const validated = need(done, 'validate')
    if (!validated.ok) throw new Error('compare needs a valid bundle')
    return { output: compare(validated.bundle, need(done, 'shadow').verdicts) }
  },

  persist: async ({ tx, run: r, done, ports }) => {
    const { snapshot, windows } = need(done, 'snapshot')
    const { verdicts } = need(done, 'shadow')
    const validated = need(done, 'validate')
    if (!validated.ok) throw new Error('persist needs a valid bundle')
    const comparisons = need(done, 'compare')
    const urls = await boundSourceUrls(tx, r.projectId)
    const windowIds = new Set(windows.map((w) => w.id))
    const nightIds = new Set(snapshot.nights.map((n) => n.id))
    const scoped = [...verdicts.windows, ...verdicts.nights]
    const calls = validated.bundle.calls.map((c: ProposedBundle['calls'][number]): CallDraft => {
      const id = c.window_id
      const shadow = scoped.find((v) => v.scope.id === id)
      if (!shadow) throw new Error(`no shadow verdict for ${id}`)
      const isNight = !windowIds.has(id) && nightIds.has(id)
      return {
        windowId: isNight ? null : id,
        nightId: isNight ? id : null,
        mode: c.mode,
        watch: c.watch,
        noCall: c.no_call,
        fired: c.fired,
        recommendations: c.recommendations,
        recipients: c.recipients,
        notices: c.notices,
        reason: c.reason,
        shadow: wireVerdict(shadow, urls),
        chosen: 'agent',
        agrees: comparisons.find((x) => x.windowId === id)?.agrees ?? false
      }
    })
    // GST-5, D23: a run over a guest window drafts a bundle that never sends.
    const guest = windowIds.size
      ? await tx
          .select({ id: window.id })
          .from(window)
          .where(and(inArray(window.id, [...windowIds]), eq(window.guest, true)))
          .limit(1)
      : []
    const made = await createBundle(tx, {
      runId: r.id,
      pack: r.pack,
      draftOnly: guest.length > 0,
      calls,
      triggeredAt: r.triggeredAt,
      now: ports.now()
    })
    return {
      output: { bundleId: made.bundleId, state: made.state },
      finish: { status: 'drafted', bundleId: made.bundleId, shadowMode: shadowMode(done) }
    }
  }
}

/** The recorded steps' outputs by step. */
const outputsOf = (recorded: Awaited<ReturnType<typeof runSteps>>) =>
  Object.fromEntries([...recorded].map(([name, row]) => [name, row.output])) as Done

/**
 * A database fault that a later delivery can outlast: a lost or refused connection (SQLSTATE classes 08, 53 and 57,
 * or a socket error) or a rolled-back transaction (class 40, such as a deadlock), under Drizzle's wrapper.
 */
export function transient(error: unknown): boolean {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code !== 'string') continue
    if (/^(08|40|53|57)[0-9A-Z]{3}$/.test(e.code)) return true
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(e.code)) return true
  }
  return false
}

const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

/**
 * The `runs-requested` handler's work for one message: claim the run (a second run of the project and pack stays
 * queued), then walk its unfinished steps. A step that throws fails the run (`{step}_failed`, the error in its
 * `run_step` row) and publishes the next, unless the fault is a transient database one, which goes back to Pub/Sub to
 * redeliver, as does a failure to record the failed run.
 */
export async function executeRun(
  ports: RunPorts,
  message: { orgId: string; runId: string },
  hooks: RunHooks = {}
): Promise<ClaimOutcome> {
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) =>
    withTenant({ orgId: message.orgId, principal: systemPrincipal(RUNS_JOB) }, fn)
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null
  const claim = await inOrg((tx) => claimRun(tx, message.runId, { traceId }))
  if (claim.outcome !== 'started' && claim.outcome !== 'resumed') {
    log('INFO', 'run not started', { run_id: message.runId, outcome: claim.outcome })
    return claim.outcome
  }

  for (const step of RUN_STEPS) {
    let ran: boolean
    let ended: boolean
    try {
      ;({ ran, ended } = await inOrg(async (tx) => {
        const r = await lockRun(tx, message.runId)
        if (r.status !== 'running') return { ran: false, ended: true }
        const recorded = await runSteps(tx, r.id)
        if (recorded.has(step)) return { ran: false, ended: false }
        const done = outputsOf(recorded)
        const startedAt = new Date()
        const result = await (STEPS[step] as Step<RunStepName>)({ tx, run: r, done, ports })
        await recordStep(tx, r.id, step, 'done', result.output, startedAt)
        if (result.finish) await finishRun(tx, r, result.finish)
        return { ran: true, ended: Boolean(result.finish) }
      }))
    } catch (error) {
      log('ERROR', 'run step failed', { run_id: message.runId, step, error: errorText(error) })
      // Pub/Sub redelivers, and the run resumes at this step.
      if (transient(error)) throw error
      await inOrg(async (tx) => {
        const r = await lockRun(tx, message.runId)
        if (r.status !== 'running') return
        const recorded = await runSteps(tx, r.id)
        const done = outputsOf(recorded)
        await recordStep(tx, r.id, step, 'failed', { error: errorText(error).slice(0, 1000) }, new Date())
        await finishRun(tx, r, { status: 'failed', reason: `${step}_failed`, shadowMode: shadowMode(done) })
      })
      return claim.outcome
    }
    if (ran) await hooks.afterStep?.(step)
    if (ended) break
  }
  return claim.outcome
}
