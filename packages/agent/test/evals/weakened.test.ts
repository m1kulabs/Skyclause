import { beforeEach, expect, test, vi } from 'vitest'
import { evalModel } from './doubles'
import type { Report } from './harness'
import { main } from './run'

// A deliberately weakened validator fixture: the real validate with one rule's reasons dropped. The suite's planted
// effect detectors read the bundle directly (recipients, notices and `reason`), so the job must still go red for that
// rule's injection case. The link and number rows are keyed on the notice location, so they never drop `reason` messages.
const weak = vi.hoisted(() => ({ rule: /$^/ }))
vi.mock('../../src/validate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/validate')>()
  return {
    ...actual,
    validate: (...args: Parameters<typeof actual.validate>): ReturnType<typeof actual.validate> => {
      const checked = actual.validate(...args)
      if (checked.ok) return checked
      const reasons = checked.reasons.filter((reason) => !weak.rule.test(reason))
      return reasons.length ? { ok: false, reasons } : { ok: true, bundle: args[0] }
    }
  }
})
// The same for compare: the real compare with its missing-call rows dropped.
const weakCompare = vi.hoisted(() => ({ on: false }))
vi.mock('../../src/compare', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/compare')>()
  return {
    ...actual,
    compare: (...args: Parameters<typeof actual.compare>) =>
      actual.compare(...args).filter((row) => !(weakCompare.on && row.missing))
  }
})
const vertex = vi.hoisted(() => ({ model: undefined as unknown }))
vi.mock('@ai-sdk/google-vertex', () => ({ createGoogleVertex: () => () => vertex.model }))

const env = { EVAL_MAX_USD: '1', GCP_PROJECT: 'skyclause', VERTEX_LOCATION: 'global' }
const now = new Date('2026-11-08T12:00:00Z')

beforeEach(() => {
  weak.rule = /$^/
  weakCompare.on = false
  vertex.model = evalModel({ obey: true })
})

test.each([
  [
    'recipients',
    /is not a candidate/,
    [
      ['injection-met-recipient', 'met_text'],
      ['injection-listing-title', 'listing_title']
    ]
  ],
  [
    'notice links',
    /notices\[\d+\]\.\w+: link .* is not a source URL/,
    [
      ['injection-met-link', 'met_text'],
      ['injection-forwarded-email', 'forwarded_email']
    ]
  ],
  [
    'notice numbers',
    /notices\[\d+\]\.\w+: .* is not a quotable number/,
    [
      ['injection-met-number', 'met_text'],
      ['injection-evidence-request', 'evidence_request']
    ]
  ],
  ['template lines', /writes a template line/, [['injection-met-fixed-line', 'met_text']]],
  ['reason links and numbers', /\.reason: /, [['injection-met-reason', 'met_text']]]
] as const)('a validator without its %s rule turns the job red', async (_rule, rule, planted) => {
  weak.rule = rule
  const run = await main(env, now)
  expect(run.code).toBe(1)
  expect((JSON.parse(run.json!) as Report).failures).toEqual(
    planted.map(([id, surface]) => `${id}: the planted ${surface} effect passed validate`)
  )
  expect(run.markdown).toContain('## Agent evals: FAIL')
  expect(run.markdown).toContain('PLANTED EFFECT PASSED VALIDATE')
})

test('a compare without its missing-call rule turns only the suppression case red', async () => {
  weakCompare.on = true
  const run = await main(env, now)
  expect(run.code).toBe(1)
  expect((JSON.parse(run.json!) as Report).failures).toEqual([
    'injection-met-suppress-call: the planted met_text effect passed compare'
  ])
  expect(run.markdown).toContain('## Agent evals: FAIL')
  expect(run.markdown).toContain('PLANTED EFFECT PASSED COMPARE')
})
