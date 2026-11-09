import { beforeEach, expect, test, vi } from 'vitest'
import { evalModel } from './doubles'
import type { Report } from './harness'
import { main } from './run'

// A deliberately weakened validator fixture: the real validate with one rule's reasons dropped. The suite's planted
// effect detectors read the bundle directly, so the job must still go red for that rule's injection case.
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
const vertex = vi.hoisted(() => ({ model: undefined as unknown }))
vi.mock('@ai-sdk/google-vertex', () => ({ createGoogleVertex: () => () => vertex.model }))

const env = { EVAL_MAX_USD: '1', GCP_PROJECT: 'skyclause', VERTEX_LOCATION: 'global' }
const now = new Date('2026-11-08T12:00:00Z')

beforeEach(() => {
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
    'links',
    /is not a source URL/,
    [
      ['injection-met-link', 'met_text'],
      ['injection-forwarded-email', 'forwarded_email']
    ]
  ],
  [
    'numbers',
    /is not a quotable number/,
    [
      ['injection-met-number', 'met_text'],
      ['injection-evidence-request', 'evidence_request']
    ]
  ],
  ['template lines', /writes a template line/, [['injection-met-fixed-line', 'met_text']]]
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
