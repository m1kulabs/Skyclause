import { describe, expect, test } from 'bun:test'
import { latestMetWarningRows, metNamesKl, metWarningInForce } from './met-warning.ts'

const from = '2026-11-05T21:00:00+08:00'
const to = '2026-11-06T01:00:00+08:00'
const ms = (value: string) => Date.parse(value)

describe('MET warning semantics', () => {
  test('names KL only in either published text, case insensitively, with title exclusions', () => {
    const row = { title_en: 'Thunderstorms Warning', text_en: '', text_bm: '' }
    expect(metNamesKl(row)).toBe(false)
    expect(metNamesKl({ ...row, title_en: 'Kuala Lumpur' })).toBe(false)
    for (const field of ['text_en', 'text_bm'] as const) {
      expect(metNamesKl({ ...row, [field]: 'over KUALA LUMPUR today' })).toBe(true)
      for (const title_en of ['No Advisory', 'Strong Winds and Rough Seas Warning', 'Rough Seas']) {
        expect(metNamesKl({ ...row, title_en, [field]: 'Kuala Lumpur' })).toBe(false)
      }
    }
  })

  test('uses inclusive boundaries including exact endpoints and zero-length spans', () => {
    const row = { title_en: 'Thunderstorms Warning', valid_from: from, valid_to: to }
    expect(metWarningInForce(row, ms(from), ms(from))).toBe(true)
    expect(metWarningInForce(row, ms(to), ms(to))).toBe(true)
    expect(
      metWarningInForce({ ...row, valid_from: new Date(ms(from)), valid_to: '2026-11-05T17:00:00Z' }, ms(from), ms(to))
    ).toBe(true)
    expect(metWarningInForce({ ...row, valid_to: from }, ms(from), ms(from))).toBe(true)
    expect(metWarningInForce(row, ms('2026-11-06T01:05:00+08:00'), ms('2026-11-06T02:00:00+08:00'))).toBe(false)
    expect(
      metWarningInForce(
        { ...row, valid_from: '2026-11-08T00:00:00+08:00', valid_to: '2026-11-10T23:59:59+08:00' },
        ms(from),
        ms(to)
      )
    ).toBe(false)
    expect(metWarningInForce({ ...row, title_en: 'No Advisory' }, ms(from), ms(to))).toBe(false)
    for (const invalid of [undefined, null, '', 'bad', '2026-02-30T21:00:00+08:00', '2026-11-05T21:00:00']) {
      expect(metWarningInForce({ ...row, valid_from: invalid }, ms(from), ms(to))).toBe(false)
      expect(metWarningInForce({ ...row, valid_to: invalid }, ms(from), ms(to))).toBe(false)
    }
    expect(metWarningInForce({ ...row, valid_from: to, valid_to: from }, ms(from), ms(to))).toBe(false)
    expect(metWarningInForce(row, ms(to), ms(from))).toBe(false)
    expect(metWarningInForce(row, NaN, ms(to))).toBe(false)
    expect(metWarningInForce(row, ms(from), Infinity)).toBe(false)
  })

  test('selects latest eligible revision before relevance or interval filtering, preserving DTO references', () => {
    const a = { warning_key: 'key', issued: from, first_seen_at: from, names_kl: true, valid_to: to }
    const b = { ...a, first_seen_at: '2026-11-05T22:00:00+08:00', names_kl: false, valid_to: from }
    expect(latestMetWarningRows([a, b])).toEqual([b])
    expect(latestMetWarningRows([a, b])[0]).toBe(b)
    const c = { ...a, issued: to }
    expect(latestMetWarningRows([c, b])).toEqual([c])
    expect(latestMetWarningRows([a, b, { ...a, first_seen_at: b.first_seen_at }])[0]!.names_kl).toBe(true)
    expect(latestMetWarningRows([b, a])).toEqual([b])
    expect(
      latestMetWarningRows([{ ...a, issued: new Date(ms(from)), first_seen_at: '2026-11-05T13:00:00Z' }])
    ).toHaveLength(1)
    // No as-of clock is imposed here; callers supply their own eligible inputs.
    expect(latestMetWarningRows([{ ...a, first_seen_at: '2099-01-01T00:00:00+08:00' }])).toHaveLength(1)
  })

  test('does not turn missing or invalid revision metadata into eligible instants', () => {
    const row = { warning_key: 'key', issued: from, first_seen_at: from }
    for (const invalid of [undefined, null, '', 'bad', '2026-02-30T21:00:00+08:00']) {
      expect(latestMetWarningRows([{ ...row, issued: invalid }])).toEqual([])
      expect(latestMetWarningRows([{ ...row, first_seen_at: invalid }])).toEqual([])
    }
    expect(latestMetWarningRows([{ ...row, warning_key: '' }])).toEqual([])
  })
})
