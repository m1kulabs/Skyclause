import { expect, test, vi } from 'vitest'
import { draftBundle } from '../src/draft'
import { PROMPT_SERIES_MS, recentSeries } from '../src/prompt'
import { replayBundle, replayInput } from './fixtures/replay'
import { entry, scripted } from './model-double'

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')

/** Seven days of 5-minute points ending at `tEval`, as a bound gauge's backfill leaves in the evaluator's history. */
function week(tEval: string): Array<[string, number | null, string]> {
  const end = Date.parse(tEval)
  return Array.from({ length: 7 * 288 }, (_, i) => {
    const at = end - (7 * 288 - 1 - i) * 300_000
    return [iso(at), 0, `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`]
  })
}

test('a series keeps only its last six hours, or its newest point when it has none that recent', () => {
  const tEval = '2026-11-02T07:05:00Z'
  const long = week(tEval)
  const old: Array<[string, number | null, string]> = [
    ['2026-11-01T01:00:00Z', 1, 'a'],
    ['2026-11-01T02:00:00Z', 2, 'b']
  ]
  const trimmed = recentSeries({ 'site.rain_5m_mm': long, 'w.met_warning_in_force': old }, tEval)
  expect(trimmed['site.rain_5m_mm']).toHaveLength(PROMPT_SERIES_MS / 300_000 + 1)
  expect(trimmed['site.rain_5m_mm']!.every(([at]) => Date.parse(at) >= Date.parse(tEval) - PROMPT_SERIES_MS)).toBe(true)
  expect(trimmed['site.rain_5m_mm']!.at(-1)).toEqual(long.at(-1))
  expect(trimmed['w.met_warning_in_force']).toEqual([old[1]])
})

test('a week of 5-minute history no longer stops the draft on the input budget', async () => {
  const input = replayInput()
  input.snapshot.series = { ...input.snapshot.series, 'w.rain_max_60m_mm': week(input.snapshot.tEval) }
  const modelFor = vi.fn(async () => scripted([JSON.stringify(replayBundle())]))
  const result = await draftBundle(input, { chain: [entry()], modelFor })
  expect(result).not.toMatchObject({ reason: 'budget' })
  expect(modelFor).toHaveBeenCalled()
})
