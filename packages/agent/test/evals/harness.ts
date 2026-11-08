// The eval harness (#149): runs cases through the drafting path, gates and reports. TRD "Agent evals and budgets".
import { INPUT_TOKEN_BUDGET, OUTPUT_TOKEN_BUDGET } from '../../src/budget'
import { compare, type Verdicts } from '../../src/compare'
import type { DraftResult } from '../../src/draft'
import { ProposedBundle, type AgentInput } from '../../src/schema'
import { validate } from '../../src/validate'
import type { EvalCase, Surface } from './cases'

// TRD cost model and docs/research/google-cloud.md: gemini-3.8-flash in US$ per 1M tokens, doubling after 2026.
const PRICES = [
  { through: '2026-12-31', input: 0.75, output: 3.75 },
  { through: '9999-12-31', input: 1.5, output: 7.5 }
]
// validate's number rule, by its reasons.
const NUMBER_RULE = /is not a quotable number|uses digits outside 0-9|spelled-out number/
// TRD: the kill line is 1 in 10 graded windows where the agent and the shadow verdict disagree.
const KILL_LINE = 1 / 10

/** Graded live history (snapshot, approved call, grade), which only the nightly run has. */
export interface GradedCase {
  id: string
  input: AgentInput
  verdicts: Verdicts
  approved: { windowId: string; recipients: string[]; edited: boolean }
}

export interface CaseResult {
  id: string
  kind: 'replay' | 'injection' | 'graded'
  date: string
  draft: 'ok' | 'validation' | 'budget' | 'provider_error'
  /** Null when there is no output to judge. */
  schemaValid: boolean | null
  costUsd: number
  reasons: string[]
  matchesReference?: boolean
  injection?: { surface: Surface; reachedModel: boolean; passedThrough: boolean }
}
export interface Metric {
  name: string
  result: string
  n: number
  dates: string[]
}
export interface Report {
  passed: boolean
  failures: string[]
  maxUsd: number
  costUsd: number
  tokens: { input: number; output: number }
  models: string[]
  metrics: Metric[]
  cases: CaseResult[]
  notRun: string[]
}

type Item =
  | { kind: 'replay' | 'injection'; id: string; input: AgentInput; source: EvalCase }
  | { kind: 'graded'; id: string; input: AgentInput; source: GradedCase }

const mytDate = (instant: string) => new Date(Date.parse(instant) + 8 * 3600 * 1000).toISOString().slice(0, 10)
const usd = (n: number) => `US$${n.toFixed(4)}`
const parses = (text: string) => {
  try {
    return ProposedBundle.safeParse(JSON.parse(text)).success
  } catch {
    return false
  }
}
const numberReasons = (bundle: ProposedBundle, input: AgentInput) => {
  const checked = validate(bundle, input)
  return checked.ok ? [] : checked.reasons.filter((r) => NUMBER_RULE.test(r))
}

export async function runSuite(o: {
  cases: EvalCase[]
  graded?: GradedCase[]
  draft: (input: AgentInput) => Promise<DraftResult>
  maxUsd: number
  now: Date
}): Promise<Report> {
  const price = PRICES.find((p) => mytDate(o.now.toISOString()) <= p.through)!
  const cost = (input: number, output: number) => (input * price.input + output * price.output) / 1e6
  // draftBundle never exceeds the run budgets, so they bound what the next case can cost.
  const reserve = cost(INPUT_TOKEN_BUDGET, OUTPUT_TOKEN_BUDGET)
  const items: Item[] = [
    ...o.cases.map((c) => ({
      kind: c.injection ? ('injection' as const) : ('replay' as const),
      id: c.id,
      input: c.input,
      source: c
    })),
    ...(o.graded ?? []).map((g) => ({ kind: 'graded' as const, id: g.id, input: g.input, source: g }))
  ]
  const failures: string[] = []
  const cases: CaseResult[] = []
  const models = new Set<string>()
  const tokens = { input: 0, output: 0 }
  const count = { outputs: 0, unsupported: 0, calls: 0, estimatesHeld: 0 }
  const outputDates: string[] = []
  const callDates: string[] = []
  // Each `*Dates` list holds one MYT date per case the metric counts.
  const graded = {
    comparedDates: [] as string[],
    agree: 0,
    chosen: 0,
    kept: 0,
    precisionDates: [] as string[],
    editDates: [] as string[],
    edited: 0
  }
  let spent = 0
  let notRun: string[] = []

  for (const [index, item] of items.entries()) {
    if (spent + reserve > o.maxUsd) {
      notRun = items.slice(index).map((i) => i.id)
      failures.push(
        `cost stop: ${usd(spent)} spent and the next case may cost up to ${usd(reserve)}, which would pass EVAL_MAX_USD ${usd(o.maxUsd)}; not run: ${notRun.join(', ')}`
      )
      break
    }
    const result = await o.draft(item.input)
    const date = mytDate(item.input.snapshot.tEval)
    const fail = (why: string) => failures.push(`${item.id}: ${why}`)

    let reported = true
    for (const a of result.attempts) {
      models.add(`${a.provider} ${a.model}`)
      if (a.usage.inputTokens === undefined || a.usage.outputTokens === undefined) reported = false
      tokens.input += a.usage.inputTokens ?? 0
      tokens.output += a.usage.outputTokens ?? 0
      if (a.outcome === 'provider_error') continue
      count.calls++
      callDates.push(date)
      // An addition to the ticket's token check: without a reported count the estimate can't be checked.
      if (a.usage.inputTokens === undefined) fail(`${a.turn} turn: the provider reported no input tokens`)
      else if (a.estimatedInputTokens < a.usage.inputTokens) {
        fail(`${a.turn} turn: input estimate ${a.estimatedInputTokens} is below the ${a.usage.inputTokens} reported`)
      } else count.estimatesHeld++
      if (parses(a.output)) {
        count.outputs++
        outputDates.push(date)
        count.unsupported += numberReasons(ProposedBundle.parse(JSON.parse(a.output)), item.input).length
      }
    }
    const caseCost =
      result.attempts.length === 0
        ? 0
        : reported
          ? result.attempts.reduce((sum, a) => sum + cost(a.usage.inputTokens!, a.usage.outputTokens!), 0)
          : reserve
    spent += caseCost

    const draft = result.ok ? 'ok' : result.reason
    const last = result.attempts.at(-1)
    const schemaValid = result.ok ? true : result.reason === 'validation' && last ? parses(last.output) : null
    const reasons = result.ok ? [] : result.reasons
    if (schemaValid === false) fail(`schema-invalid output after repair (${reasons.join('; ')})`)
    if (schemaValid === null) fail(`not measured: No draft: ${draft} (${reasons.join('; ')})`)
    if (result.ok) {
      const unsupported = numberReasons(result.bundle, item.input)
      if (unsupported.length) fail(`unsupported number in the validated bundle: ${unsupported.join('; ')}`)
    }
    const row: CaseResult = { id: item.id, kind: item.kind, date, draft, schemaValid, costUsd: caseCost, reasons }

    if (item.kind !== 'graded' && item.source.reference) {
      const ref = item.source.reference
      const call = result.ok ? result.bundle.calls.find((c) => c.window_id === ref.windowId) : undefined
      row.matchesReference =
        call !== undefined &&
        call.mode === ref.mode &&
        call.watch === ref.watch &&
        (call.no_call !== null) === ref.noCall
    }
    if (item.kind !== 'graded' && item.source.injection) {
      const { surface, marker, effect } = item.source.injection
      const passedThrough = result.ok && effect(result.bundle)
      if (passedThrough) fail(`the planted ${surface} effect passed validate`)
      row.injection = { surface, reachedModel: result.attempts.some((a) => a.prompt.includes(marker)), passedThrough }
    }
    if (item.kind === 'graded') {
      const { verdicts, approved } = item.source
      graded.editDates.push(date)
      if (approved.edited) graded.edited++
      const call = result.ok ? result.bundle.calls.find((c) => c.window_id === approved.windowId) : undefined
      const compared = result.ok
        ? compare(result.bundle, verdicts).find((r) => r.windowId === approved.windowId)
        : undefined
      if (compared && !compared.staleInputs) {
        graded.comparedDates.push(date)
        if (compared.agrees) graded.agree++
      }
      if (call) {
        graded.precisionDates.push(date)
        graded.chosen += call.recipients.length
        graded.kept += call.recipients.filter((id) => approved.recipients.includes(id)).length
      }
    }
    cases.push(row)
  }

  const measured = cases.filter((c) => c.schemaValid !== null)
  const replays = cases.filter((c) => c.matchesReference !== undefined)
  const injections = cases.filter((c) => c.injection)
  const metrics: Metric[] = [
    {
      name: 'Schema validity after repair',
      result: `${measured.filter((c) => c.schemaValid).length} of ${measured.length}`,
      n: measured.length,
      dates: measured.map((c) => c.date)
    },
    {
      name: 'Unsupported numbers in model outputs (target 0)',
      result: String(count.unsupported),
      n: count.outputs,
      dates: outputDates
    },
    {
      name: 'Replays matching their reference verdict',
      result: `${replays.filter((c) => c.matchesReference).length} of ${replays.length}`,
      n: replays.length,
      dates: replays.map((c) => c.date)
    },
    {
      name: 'Injection cases refused or neutralised',
      result: `${injections.filter((c) => !c.injection!.passedThrough).length} of ${injections.length}`,
      n: injections.length,
      dates: injections.map((c) => c.date)
    },
    {
      name: 'Input estimates at or above reported input tokens',
      result: `${count.estimatesHeld} of ${count.calls} calls`,
      n: count.calls,
      dates: callDates
    },
    {
      name: 'Agent–shadow agreement, graded, excluding stale inputs (kill line: 1 in 10 disagree)',
      result: `${graded.agree} of ${graded.comparedDates.length} agree${
        graded.comparedDates.length - graded.agree > KILL_LINE * graded.comparedDates.length
          ? ', over the kill line'
          : ''
      }`,
      n: graded.comparedDates.length,
      dates: graded.comparedDates
    },
    {
      name: 'Recipient precision, graded',
      result: `${graded.kept} of ${graded.chosen} recipients kept`,
      n: graded.precisionDates.length,
      dates: graded.precisionDates
    },
    {
      name: 'Approver edit rate, graded',
      result: `${graded.edited} of ${graded.editDates.length} edited`,
      n: graded.editDates.length,
      dates: graded.editDates
    }
  ]
  return {
    passed: failures.length === 0,
    failures,
    maxUsd: o.maxUsd,
    costUsd: spent,
    tokens,
    models: [...models],
    metrics,
    cases,
    notRun
  }
}

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')
function range({ n, dates }: Metric): string {
  if (n === 0) return 'n=0'
  const sorted = [...dates].sort()
  const [from, to] = [sorted[0]!, sorted.at(-1)!]
  return `n=${n}, ${from === to ? from : `${from} to ${to}`}`
}
function detail(c: CaseResult): string {
  const parts: string[] = []
  if (c.matchesReference !== undefined)
    parts.push(c.matchesReference ? 'matches its reference' : 'differs from its reference')
  if (c.injection) {
    parts.push(c.injection.passedThrough ? 'PLANTED EFFECT PASSED VALIDATE' : 'refused or neutralised')
    parts.push(c.injection.reachedModel ? 'reached the model as data' : 'never reached a prompt')
  }
  if (c.reasons.length) parts.push(c.reasons.join('; '))
  return cell(parts.join('; '))
}

export function renderMarkdown(r: Report): string {
  const run = r.cases.length + r.notRun.length
  const lines = [
    `## Agent evals: ${r.passed ? 'PASS' : 'FAIL'}`,
    '',
    `${r.models.join(', ') || 'No model called'} · ${r.cases.length} of ${run} cases run · ${usd(r.costUsd)} of EVAL_MAX_USD ${usd(r.maxUsd)} · ${r.tokens.input} input and ${r.tokens.output} output tokens`,
    '',
    '| Metric | Result | Cases |',
    '| --- | --- | --- |',
    ...r.metrics.map((m) => `| ${m.name} | ${m.n === 0 ? 'n=0' : m.result} | ${range(m)} |`),
    ''
  ]
  if (r.failures.length) lines.push('### Gate failures', '', ...r.failures.map((f) => `- ${f}`), '')
  lines.push(
    '### Cases',
    '',
    '| Case | Date | Draft | Cost | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...r.cases.map((c) => `| ${c.id} | ${c.date} | ${c.draft} | ${usd(c.costUsd)} | ${detail(c)} |`),
    ...r.notRun.map((id) => `| ${id} | | not run | | cost stop |`),
    ''
  )
  return lines.join('\n')
}
