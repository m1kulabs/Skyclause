// #161 c-grades: TRD grading's outcome rules and the ticket's review reasons, as a table.
import { describe, expect, test } from 'vitest'
import { crowdOutcome, gradeSky, lastSpanEnd, type SkyCall } from '../src/grades/rules'

const approved = (mode: SkyCall['mode']): SkyCall => ({ mode, noCall: false, approved: true, state: 'approved' })
const unapproved = (mode: SkyCall['mode'], state: SkyCall['state']): SkyCall => ({
  mode,
  noCall: false,
  approved: false,
  state
})
const quiet = { shadowFired: false, windowApproved: false }

describe('Sky outcomes (TRD grading, read literally)', () => {
  test.each([
    ['approved above, observed above', approved('commute_disruption'), 'commute_disruption', 'hit', 0, []],
    ['approved above, observed a higher mode', approved('outdoor_limited'), 'hybrid_recommended', 'hit', 2, []],
    ['approved above, observed a lower mode', approved('hybrid_recommended'), 'outdoor_limited', 'hit', -2, []],
    ['approved above, observed Normal', approved('hybrid_recommended'), 'normal', 'false_alarm', 0, ['false_alarm']],
    ['approved Normal, observed above', approved('normal'), 'commute_disruption', 'miss', 0, ['miss']],
    ['approved Normal, observed Normal', approved('normal'), 'normal', 'correct_normal', 0, []],
    [
      'rejected above, observed above',
      unapproved('commute_disruption', 'rejected'),
      'commute_disruption',
      'miss',
      0,
      ['miss']
    ],
    [
      'rejected above, observed Normal',
      unapproved('commute_disruption', 'rejected'),
      'normal',
      'correct_normal',
      0,
      []
    ],
    [
      'expired above, observed above',
      unapproved('outdoor_limited', 'expired'),
      'commute_disruption',
      'miss',
      1,
      ['miss', 'expired_above_normal']
    ],
    [
      'expired above, observed Normal',
      unapproved('outdoor_limited', 'expired'),
      'normal',
      'correct_normal',
      0,
      ['expired_above_normal']
    ],
    ['expired Normal, observed Normal', unapproved('normal', 'expired'), 'normal', 'correct_normal', 0, []]
  ] as const)('%s', (_, call, observed, outcome, modeDiff, reasons) => {
    expect(gradeSky({ call, observed, ...quiet })).toEqual({ outcome, noCall: false, modeDiff, reasons })
  })

  test('a required input missing over the span (observed null) is No call, whatever was proposed (ANL-1)', () => {
    expect(gradeSky({ call: approved('commute_disruption'), observed: null, ...quiet })).toEqual({
      outcome: 'no_call',
      noCall: true,
      modeDiff: 0,
      reasons: []
    })
  })

  test('a No call call is counted apart, even when the weather turned', () => {
    const call: SkyCall = { mode: null, noCall: true, approved: true, state: 'approved' }
    expect(gradeSky({ call, observed: 'commute_disruption', ...quiet })).toMatchObject({
      outcome: 'no_call',
      noCall: true
    })
  })
})

describe('ANL-2: a window whose shadow verdict fired with no approved call', () => {
  test.each([
    ['observed above', 'commute_disruption', 'miss', ['miss', 'no_call']],
    ['observed Normal', 'normal', 'correct_normal', ['no_call']],
    ['observed nothing', null, 'no_call', ['no_call']]
  ] as const)('a window-only grade, %s, is listed as no_call', (_, observed, outcome, reasons) => {
    expect(gradeSky({ call: null, observed, shadowFired: true, windowApproved: false })).toMatchObject({
      outcome,
      reasons
    })
  })

  test('a rejected call of such a window carries no_call too; an approved call of the window clears it', () => {
    const rejected = unapproved('outdoor_limited', 'rejected')
    expect(gradeSky({ call: rejected, observed: 'normal', shadowFired: true, windowApproved: false }).reasons).toEqual([
      'no_call'
    ])
    expect(gradeSky({ call: rejected, observed: 'normal', shadowFired: true, windowApproved: true }).reasons).toEqual(
      []
    )
  })
})

describe('Crowd outcomes', () => {
  test.each([
    [19_315, 'in_band'],
    [27_044, 'in_band'],
    [32_100, 'in_band'],
    [19_314, 'out_of_band'],
    [33_804, 'out_of_band']
  ] as const)('%d exits against the band 19,315–32,100 is %s', (actual, outcome) => {
    expect(crowdOutcome(actual, { low: 19_315, high: 32_100 })).toBe(outcome)
  })
})

describe('lastSpanEnd', () => {
  const window = { startsAt: new Date('2026-11-02T07:30:00Z'), endsAt: new Date('2026-11-02T09:00:00Z') }
  const clause = (scope: 'site' | 'window', to?: string, enabled = true) => ({
    scope,
    enabled,
    requires: [],
    ...(to ? { span: { from: 'start-30m', to } } : {})
  })
  // Flash-flood risk as published: it reads a window rain maximum and writes no span.
  const flashFlood = (enabled = true) => ({ scope: 'window' as const, enabled, requires: ['w.rain_max_4h_mm'] })

  test('is the window end when no window clause reaches past it', () => {
    expect(lastSpanEnd(window, [clause('window'), clause('window', 'end-30m'), clause('site', 'end+4h')])).toEqual(
      window.endsAt
    )
  })

  test('is the latest enabled window clause span end (Storm confirmed: end+60m)', () => {
    const clauses = [clause('window', 'end+60m'), clause('window', 'start+2h'), clause('window', 'end+5h', false)]
    expect(lastSpanEnd(window, clauses)).toEqual(new Date('2026-11-02T10:00:00Z'))
  })

  test('is the default span end for an enabled window clause reading a window rain maximum with no written span', () => {
    expect(lastSpanEnd(window, [clause('window'), flashFlood()])).toEqual(new Date('2026-11-02T10:00:00Z'))
    expect(lastSpanEnd(window, [flashFlood(false)])).toEqual(window.endsAt)
  })

  test('accepts s and d span units as the clause engine does', () => {
    expect(lastSpanEnd(window, [clause('window', 'end+90s')])).toEqual(new Date('2026-11-02T09:01:30Z'))
    expect(lastSpanEnd(window, [clause('window', 'end+1d')])).toEqual(new Date('2026-11-03T09:00:00Z'))
  })

  test('refuses a span reference outside the TRD form', () => {
    expect(() => lastSpanEnd(window, [clause('window', 'end+1w')])).toThrow(/span/)
  })
})
