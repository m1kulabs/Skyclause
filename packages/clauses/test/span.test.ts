import { describe, expect, test } from 'vitest'
import { effectiveSpan, parseSpanRef } from '../src'
import type { Clause } from '../src/types'

describe('parseSpanRef', () => {
  test.each([
    ['start', { anchor: 'start', offsetMs: 0 }],
    ['end', { anchor: 'end', offsetMs: 0 }],
    ['end+90s', { anchor: 'end', offsetMs: 90_000 }],
    ['start-30m', { anchor: 'start', offsetMs: -1_800_000 }],
    ['end+2h', { anchor: 'end', offsetMs: 7_200_000 }],
    ['end+1d', { anchor: 'end', offsetMs: 86_400_000 }]
  ] as const)('parses %s across s, m, h and d units', (ref, expected) => {
    expect(parseSpanRef(ref)).toEqual(expected)
  })

  test('returns null outside (start|end)[+-]<n>(s|m|h|d)', () => {
    expect(parseSpanRef('end+1w')).toBeNull()
    expect(parseSpanRef('noon')).toBeNull()
  })
})

const clause = (over: Partial<Clause>): Clause => ({
  key: 'c',
  name: 'C',
  enabled: true,
  scope: 'window',
  requires: [],
  when: 'true',
  proposes: {},
  wording: {},
  ...over
})

describe('effectiveSpan: the span the engine evaluates a window clause over', () => {
  const DEFAULT = { from: 'end-30m', to: 'end+60m' }

  test('is the written span', () => {
    const span = { from: 'start', to: 'end+2h' }
    expect(effectiveSpan(clause({ requires: ['w.rain_max_60m_mm'], span }))).toEqual(span)
  })

  test.each([
    ['requires Storm confirmed’s 60-minute maximum', { requires: ['w.rain_max_60m_mm'] }],
    ['requires Flash-flood risk’s 4-hour maximum', { requires: ['w.rain_max_4h_mm'] }],
    ['optionally reads a window rain maximum', { requires: [], optional: ['w.rain_max_4h_mm'] }]
  ])('is end-30m to end+60m for a span-less clause that %s', (_, over) => {
    expect(effectiveSpan(clause(over))).toEqual(DEFAULT)
  })

  test('is absent for a span-less clause that reads no window rain indicator', () => {
    expect(effectiveSpan(clause({ requires: ['w.met_warning_in_force'] }))).toBeUndefined()
  })
})
