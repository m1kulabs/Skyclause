import { describe, expect, test } from 'vitest'
import { compare, type Verdicts } from '../src/compare'
import type { ProposedBundle } from '../src/schema'
import { ids, replayBundle, replayInput } from './fixtures/replay'

type Verdict = Verdicts['windows'][number]
const windows = ['019a4300-5a80-7000-8000-0000000000a1', '019a4300-5a80-7000-8000-0000000000a2', ids.window]
const reading = replayInput().snapshot.site['site.rain_60m_mm']!

function verdict(
  id: string,
  mode: Verdict['mode'],
  state: Verdict['clauses'][number]['inputs'][number]['state'] = 'fresh'
): Verdict {
  return {
    scope: { kind: 'window', id },
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
}

function verdicts(list: Verdict[]): Verdicts {
  return {
    tEval: '2026-11-02T07:05:00Z',
    pack: 'sky',
    contentHash: 'c',
    snapshotHash: 's',
    site: [],
    windows: list,
    nights: [],
    hash: 'h'
  }
}

function call(windowId: string, mode: ProposedBundle['calls'][number]['mode']): ProposedBundle['calls'][number] {
  return { ...replayBundle().calls[0]!, window_id: windowId, mode }
}

describe('CAL-4: a bundle with one disagreement renders it above all agreeing calls', () => {
  test('compare puts the one disagreement first, then agreeing calls in window order', () => {
    const bundle: ProposedBundle = {
      pack: 'sky',
      items: [],
      calls: [call(ids.window, 'commute_disruption'), call(windows[1]!, 'normal'), call(windows[0]!, 'normal')]
    }
    const shadow = verdicts([
      verdict(windows[0]!, 'normal'),
      verdict(windows[1]!, 'commute_disruption'),
      verdict(ids.window, 'commute_disruption')
    ])
    expect(compare(bundle, shadow)).toEqual([
      { windowId: windows[1], agrees: false, staleInputs: false },
      { windowId: windows[0], agrees: true, staleInputs: false },
      { windowId: ids.window, agrees: true, staleInputs: false }
    ])
  })
})

describe('compare', () => {
  test('agrees only on the same mode, watch and No call', () => {
    const shadow = verdict(ids.window, 'commute_disruption')
    const run = (change: Partial<ProposedBundle['calls'][number]>, v: Verdict = shadow) =>
      compare({ ...replayBundle(), calls: [{ ...replayBundle().calls[0]!, ...change }] }, verdicts([v]))[0]!.agrees
    expect(run({})).toBe(true)
    expect(run({ watch: true })).toBe(false)
    expect(run({ mode: null, no_call: ['w.rain_max_60m_mm'] })).toBe(false)
    const blocked = {
      name: 'w.rain_max_60m_mm',
      sourceId: ids.source,
      state: 'error' as const,
      since: '2026-11-02T06:40:00Z'
    }
    expect(
      run({ mode: null, no_call: ['w.rain_max_60m_mm'] }, { ...shadow, mode: null, noCall: { inputs: [blocked] } })
    ).toBe(true)
  })

  test('flags a call citing an input that is not fresh, including No call inputs', () => {
    const [stale] = compare(replayBundle(), verdicts([verdict(ids.window, 'commute_disruption', 'stale')]))
    expect(stale).toEqual({ windowId: ids.window, agrees: true, staleInputs: true })
    const blocked = {
      name: 'w.rain_max_60m_mm',
      sourceId: ids.source,
      state: 'error' as const,
      since: '2026-11-02T06:40:00Z'
    }
    const noCall = {
      ...verdict(ids.window, 'commute_disruption'),
      mode: null,
      clauses: [],
      noCall: { inputs: [blocked] }
    }
    const bundle = {
      ...replayBundle(),
      calls: [{ ...replayBundle().calls[0]!, mode: null, fired: [], no_call: ['w.rain_max_60m_mm'] }]
    }
    expect(compare(bundle, verdicts([noCall]))).toEqual([{ windowId: ids.window, agrees: true, staleInputs: true }])
  })

  test('counts a call with no shadow verdict as a disagreement, after the others', () => {
    const bundle: ProposedBundle = {
      pack: 'sky',
      items: [],
      calls: [call(windows[1]!, 'normal'), call(windows[0]!, 'normal')]
    }
    expect(compare(bundle, verdicts([verdict(windows[0]!, 'commute_disruption')]))).toEqual([
      { windowId: windows[0], agrees: false, staleInputs: false },
      { windowId: windows[1], agrees: false, staleInputs: false }
    ])
  })
})

describe('a call the model dropped', () => {
  const watching = { ...verdict(windows[1]!, 'normal'), watch: true }
  const bundle = (...kept: string[]): ProposedBundle => ({
    pack: 'sky',
    items: [],
    calls: kept.map((id) => call(id, id === ids.window ? 'commute_disruption' : 'normal'))
  })

  test('is a disagreement row marked missing, sorted before the calls that agree', () => {
    const shadow = verdicts([verdict(windows[0]!, 'normal'), watching, verdict(ids.window, 'commute_disruption')])
    expect(compare(bundle(windows[0]!), shadow)).toEqual([
      { windowId: windows[1], agrees: false, staleInputs: false, missing: true },
      { windowId: ids.window, agrees: false, staleInputs: false, missing: true },
      { windowId: windows[0], agrees: true, staleInputs: false }
    ])
  })

  test('is not one when the shadow verdict is Normal without watch or No call', () => {
    const noCall = { ...verdict(windows[1]!, 'normal'), mode: null, noCall: { inputs: [] } }
    const shadow = verdicts([verdict(windows[0]!, 'normal'), noCall])
    expect(compare(bundle(), shadow)).toEqual([])
  })

  test('counts a Crowd night with a fired shadow verdict and no call', () => {
    const night = { ...verdict(windows[0]!, 'surge_night'), scope: { kind: 'night' as const, id: windows[0]! } }
    expect(compare({ pack: 'crowd', items: [], calls: [] }, { ...verdicts([]), nights: [night] })).toEqual([
      { windowId: windows[0], agrees: false, staleInputs: false, missing: true }
    ])
  })
})

test('flags only inputs the verdict shows not fresh; an input it does not name is not stale', () => {
  const bundle = replayBundle()
  bundle.calls[0]!.fired[0]!.inputs = ['site.rain_60m_mm']
  expect(compare(bundle, verdicts([verdict(ids.window, 'commute_disruption')]))[0]!.staleInputs).toBe(false)
})
