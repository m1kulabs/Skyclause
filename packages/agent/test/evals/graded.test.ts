import { expect, test } from 'vitest'
import type { Verdicts } from '../../src/compare'
import { draftBundle } from '../../src/draft'
import { ids, replayInput } from '../fixtures/replay'
import { entry } from '../model-double'
import { evalModel } from './doubles'
import { runSuite, type GradedCase } from './harness'

// Graded live history comes only from the nightly run; here three graded doubles of the 2 November window, which the
// model double drafts as Commute disruption to both candidates.
type Verdict = Verdicts['windows'][number]
const reading = replayInput().snapshot.site['site.rain_60m_mm']!

function shadow(mode: Verdict['mode'], state: 'fresh' | 'stale'): Verdicts {
  const verdict: Verdict = {
    scope: { kind: 'window', id: ids.window },
    pack: 'sky',
    mode,
    watch: false,
    noCall: null,
    recommendations: [],
    clauses: [
      {
        key: 'storm_confirmed',
        result: mode === 'commute_disruption' ? 'fired' : 'not_fired',
        blockedBy: [],
        inputs: [{ ...reading, name: 'w.rain_max_60m_mm', state }]
      }
    ],
    openFrom: null
  }
  return {
    tEval: '2026-11-02T07:05:00Z',
    pack: 'sky',
    contentHash: 'c',
    snapshotHash: 's',
    site: [],
    windows: [verdict],
    nights: [],
    hash: 'h'
  }
}

const graded = (id: string, verdicts: Verdicts, recipients: string[], edited: boolean): GradedCase => ({
  id,
  input: replayInput(),
  verdicts,
  approved: { windowId: ids.window, recipients, edited }
})

test('graded metrics: agreement without stale-input cases against the kill line, recipient precision, edit rate', async () => {
  const report = await runSuite({
    cases: [],
    graded: [
      graded('agrees', shadow('commute_disruption', 'fresh'), [...ids.candidates], false),
      graded('disagrees', shadow('normal', 'fresh'), [ids.candidates[0]!], true),
      graded('stale', shadow('commute_disruption', 'stale'), [...ids.candidates], false)
    ],
    draft: (input) => draftBundle(input, { chain: [entry()], modelFor: async () => evalModel() }),
    maxUsd: 1,
    now: new Date('2026-11-08T12:00:00Z')
  })
  expect(report.passed).toBe(true)
  expect(report.metrics.slice(-3)).toEqual([
    expect.objectContaining({ result: '1 of 2 agree, over the kill line', n: 2, dates: ['2026-11-02', '2026-11-02'] }),
    expect.objectContaining({ name: 'Recipient precision, graded', result: '5 of 6 recipients kept', n: 3 }),
    expect.objectContaining({ name: 'Approver edit rate, graded', result: '1 of 3 edited', n: 3 })
  ])
})
