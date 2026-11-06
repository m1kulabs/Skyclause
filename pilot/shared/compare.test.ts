import { describe, expect, test } from 'bun:test'
import { compareWithShadow } from './compare.ts'

// The one change in the #47 spec's "Crossing file" example: the real 2 November 2026 replay, 15:30 wave.
const crossing = {
  crossing_id: 'X-20261102-1505-01',
  changes: [{ scope: 'W-0001', from: 'normal', to: 'commute_disruption', fired: ['storm_confirmed'] }]
}

describe('compareWithShadow', () => {
  test('a call that matches the shadow verdict agrees', () => {
    const shadow = crossing.changes.map((change) => ({ scope: change.scope, verdict: change.to }))
    const call = { window_id: 'W-0001', mode: 'commute_disruption', no_call: null }

    expect(compareWithShadow([call], shadow)).toEqual([
      { call, agent: 'commute_disruption', shadow: 'commute_disruption', agrees: 'Y' }
    ])
  })

  // CAL-4: "a bundle with one disagreement renders it above all agreeing calls." The 14:30, 15:00 and 15:30 waves
  // cross at 15:05 on 2 November (#55 CLS-4); W-0002 and W-0003 are test IDs, and the agent's Normal for the 15:30
  // wave is a test double.
  test('a disagreement comes first with both verdicts, and agreeing calls keep their draft order', () => {
    const shadow = ['W-0002', 'W-0003', 'W-0001'].map((scope) => ({ scope, verdict: 'commute_disruption' }))
    const wave1430 = { window_id: 'W-0002', mode: 'commute_disruption', no_call: null }
    const wave1500 = { window_id: 'W-0003', mode: 'commute_disruption', no_call: null }
    const wave1530 = { window_id: 'W-0001', mode: 'normal', no_call: null }

    expect(compareWithShadow([wave1430, wave1500, wave1530], shadow)).toEqual([
      { call: wave1530, agent: 'normal', shadow: 'commute_disruption', agrees: 'N:commute_disruption' },
      { call: wave1430, agent: 'commute_disruption', shadow: 'commute_disruption', agrees: 'Y' },
      { call: wave1500, agent: 'commute_disruption', shadow: 'commute_disruption', agrees: 'Y' }
    ])
  })

  // A drafted No call has no mode and lists the inputs that block it (TRD `Call.no_call`); the shadow verdict reads
  // `no_call`. The gauge going silent is a test double.
  test('a No call is the verdict no_call on either side', () => {
    const silent = { window_id: 'W-0001', mode: null, no_call: ['w.rain_max_60m_mm'] }
    const confirmed = { window_id: 'W-0001', mode: 'commute_disruption', no_call: null }

    expect(compareWithShadow([silent], [{ scope: 'W-0001', verdict: 'commute_disruption' }])).toEqual([
      { call: silent, agent: 'no_call', shadow: 'commute_disruption', agrees: 'N:commute_disruption' }
    ])
    expect(compareWithShadow([confirmed], [{ scope: 'W-0001', verdict: 'no_call' }])).toEqual([
      { call: confirmed, agent: 'commute_disruption', shadow: 'no_call', agrees: 'N:no_call' }
    ])
    expect(compareWithShadow([silent], [{ scope: 'W-0001', verdict: 'no_call' }])).toEqual([
      { call: silent, agent: 'no_call', shadow: 'no_call', agrees: 'Y' }
    ])
  })

  // No fallback: a window the clause engine has no verdict for, or a call with no verdict, stops the comparison.
  test('a window with no shadow row or a call with no verdict fails, naming the window', () => {
    const call = { window_id: 'W-0001', mode: 'commute_disruption', no_call: null }
    const blank = { window_id: 'W-0001', mode: null, no_call: null }

    expect(() => compareWithShadow([call], [{ scope: 'site', verdict: 'normal' }])).toThrow('no shadow row for W-0001')
    expect(() => compareWithShadow([blank], [{ scope: 'W-0001', verdict: 'normal' }])).toThrow(
      'no verdict in the call for W-0001'
    )
  })
})
