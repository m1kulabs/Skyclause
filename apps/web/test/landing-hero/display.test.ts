import { describe, expect, test } from 'vitest'
import {
  ageMinutesOf,
  beaconEventOf,
  blockedLineOf,
  errorLineOf,
  groupedVerdicts,
  hasGaugeError,
  notOpenLineOf,
  stripOf
} from '../../features/landing-hero/window-model'
import type { Verdict, Verdicts } from '@skyclause/contracts/api/shared'
import { input } from './fixtures'

const since = '2026-11-05T07:00:00.000Z'

function verdicts(pack: 'sky' | 'crowd', overrides: Partial<Verdicts> = {}): Verdicts {
  return {
    t_eval: '2026-11-05T13:05:00.000Z',
    pack,
    content_hash: 'c',
    snapshot_hash: 's',
    hash: 'h',
    site: [],
    windows: [],
    nights: [],
    ...overrides
  }
}

function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    scope: { kind: 'window', id: 'w1' },
    pack: 'sky',
    mode: 'normal',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null,
    ...over
  }
}

describe('verdict display grouping', () => {
  test('mode prefers the window verdict, then the site verdict', () => {
    const grouped = groupedVerdicts([
      verdicts('sky', {
        windows: [verdict({ mode: 'commute_disruption' })],
        site: [verdict({ mode: 'outdoor_limited' })]
      })
    ])
    expect(grouped[0]?.mode).toBe('commute_disruption')
    const siteOnly = groupedVerdicts([verdicts('sky', { site: [verdict({ mode: 'outdoor_limited' })] })])
    expect(siteOnly[0]?.mode).toBe('outdoor_limited')
    expect(groupedVerdicts([verdicts('sky')])[0]?.mode).toBeNull()
  })

  test('fired, blocked and not_open clauses split by result across site and windows', () => {
    const grouped = groupedVerdicts([
      verdicts('sky', {
        windows: [
          verdict({
            clauses: [
              { key: 'Storm confirmed', result: 'fired', blocked_by: [], inputs: [input()] },
              { key: 'Flash-flood risk', result: 'not_fired', blocked_by: [], inputs: [input()] }
            ]
          })
        ],
        site: [
          verdict({
            scope: { kind: 'site', id: null },
            clauses: [
              {
                key: 'Haze',
                result: 'blocked',
                blocked_by: [{ name: 'gauge', source_id: '0232901RF', state: 'stale', since }],
                inputs: []
              }
            ]
          })
        ],
        nights: [
          verdict({
            scope: { kind: 'night', id: 'n1' },
            clauses: [{ key: 'Surge', result: 'not_open', blocked_by: [], inputs: [] }],
            open_from: '2026-11-05T14:00:00.000Z'
          })
        ]
      })
    ])
    expect(grouped[0]?.fired.map((c) => c.key)).toEqual(['Storm confirmed'])
    expect(grouped[0]?.blocked.map((c) => c.key)).toEqual(['Haze'])
    expect(grouped[0]?.notOpen.map((c) => c.key)).toEqual(['Surge'])
  })

  test('display inputs dedupe across clauses and keep null values', () => {
    const grouped = groupedVerdicts([
      verdicts('sky', {
        windows: [
          verdict({
            clauses: [
              {
                key: 'A',
                result: 'fired',
                blocked_by: [],
                inputs: [input(), input({ name: 'site.api_max', value: 67 })]
              },
              {
                key: 'B',
                result: 'fired',
                blocked_by: [],
                inputs: [input(), input({ name: 'site.met_warning_in_force', value: null, state: 'error', since })]
              }
            ]
          })
        ]
      })
    ])
    expect(grouped[0]?.inputs.map((i) => i.name)).toEqual([
      'site.rain_60m_mm',
      'site.api_max',
      'site.met_warning_in_force'
    ])
    expect(grouped[0]?.freshCount).toBe(2)
    expect(grouped[0]?.errorCount).toBe(1)
  })
})

describe('exact LND lines', () => {
  test('blocked, erroring and not_open lines render exactly', () => {
    expect(
      blockedLineOf({
        clause: 'Storm confirmed',
        blocked: { name: 'gauge', source_id: '0232901RF', state: 'stale', since: '2026-11-05T07:00:00.000Z' }
      })
    ).toBe('No call for Storm confirmed: gauge 0232901RF silent since 15:00 MYT')
    expect(
      errorLineOf(
        input({
          name: 'JPS gauge',
          state: 'error',
          value: null,
          since: '2026-11-05T07:00:00.000Z',
          observed_at: '2026-11-05T07:00:00.000Z'
        })
      )
    ).toBe('Couldn’t reach the JPS gauge at 15:00 MYT.')
    expect(notOpenLineOf('Surge', '2026-11-05T14:00:00.000Z')).toBe('Surge evaluates from 22:00 MYT')
  })

  test('ages use age_s, derive from observed_at, and cap over ninety minutes', () => {
    expect(ageMinutesOf(input({ age_s: 720 }), '2026-11-05T13:05:00.000Z')).toBe('12 min old')
    expect(ageMinutesOf(input({ age_s: 5400 }), '2026-11-05T13:05:00.000Z')).toBe('90 min old')
    expect(
      ageMinutesOf(input({ age_s: null, observed_at: '2026-11-05T13:00:00.000Z' }), '2026-11-05T13:05:00.000Z')
    ).toBe('5 min old')
  })

  test('the gauge errors when its input is stale or erroring and a rain input exists', () => {
    expect(hasGaugeError([input({ state: 'error' })])).toBe(true)
    expect(hasGaugeError([input({ state: 'stale' })])).toBe(true)
    expect(hasGaugeError([input({ state: 'fresh' })])).toBe(false)
    expect(hasGaugeError([input({ name: 'site.api_max', state: 'error' })])).toBe(false)
  })

  test('analytics carries modes plus fresh and error counts only', () => {
    const grouped = groupedVerdicts([
      verdicts('sky', {
        windows: [
          verdict({
            mode: 'normal',
            clauses: [
              {
                key: 'A',
                result: 'fired',
                blocked_by: [],
                inputs: [input(), input({ name: 'JPS gauge', state: 'error' })]
              }
            ]
          })
        ]
      }),
      verdicts('crowd', { windows: [verdict({ pack: 'crowd', mode: null, no_call: { inputs: [] } })] })
    ])
    expect(beaconEventOf(grouped)).toEqual({
      name: 'landing_window_set',
      props: { modes: ['normal'], inputs_fresh: 1, inputs_error: 1 }
    })
  })
})

describe('derived-only strip', () => {
  test('the strip carries the 60-minute lane only, 24 hours wide, with no 5-minute readings', () => {
    const rainAt = (value: number) => ({
      ...input(),
      observed_at: value === 10 ? '2026-11-04T17:00:00.000Z' : '2026-11-04T18:00:00.000Z',
      value
    })
    const strip = stripOf(
      [
        rainAt(10),
        rainAt(12),
        { ...input(), name: 'site.rain_5m_mm', observed_at: '2026-11-04T18:00:00.000Z', value: 99 }
      ],
      { date: '2026-11-05', startMin: 60, endMin: 120 },
      '2026-11-05T13:05:00.000Z',
      '2026-11-05T13:05:00.000Z'
    )
    expect(strip?.rain5).toEqual([])
    expect(strip?.rain60.map((p) => p.value)).toEqual([10, 12])
    expect(strip?.window).toEqual({ from: '2026-11-04T17:00:00.000Z', to: '2026-11-04T18:00:00.000Z' })
    expect(
      stripOf(
        [input({ value: 5 })],
        { date: '2026-11-05', startMin: 60, endMin: 120 },
        '2026-11-05T13:05:00.000Z',
        '2026-11-05T13:05:00.000Z'
      )
    ).toBeNull()
  })
})
