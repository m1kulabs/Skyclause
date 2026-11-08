import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MET_FORECAST_ENDPOINT,
  MET_WARNING_ENDPOINT,
  parseMetForecast,
  parseMetWarnings,
  validateMetWarningRow
} from './met-parser.ts'
import type { Row } from './schema.ts'

type Raw = Record<string, unknown>
const fixtures = join(import.meta.dir, '../../fixtures')
const originals = join(import.meta.dir, '../../../docs/sources/api.data.gov.my')
const file = 'weather-forecast-kl-20261108T014413Z.json'
const warnings = (): Raw[] => JSON.parse(readFileSync(join(fixtures, 'weather-warning-20261105T1313Z.json'), 'utf8'))
const forecast = (): Raw[] => JSON.parse(readFileSync(join(fixtures, file), 'utf8'))
const stored = (): Row<'warnings'> => ({
  ...parseMetWarnings(warnings())[2]!,
  first_seen_at: '2026-11-05T21:13:00+08:00',
  last_seen_at: '2026-11-05T21:13:00+08:00',
  poll_id: 'poll',
  http_status: 200,
  latency_ms: 0
})

describe('MET real source captures', () => {
  test('pins source bytes, hash and request provenance', () => {
    const bytes = readFileSync(join(fixtures, file))
    expect(bytes).toEqual(readFileSync(join(originals, file)))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '1a4ec347805b28a3a5492513e922bd91fc177b3b8715c2efcab355d766487877'
    )
    const metadata = JSON.parse(
      readFileSync(join(originals, 'weather-forecast-kl-20261108T014413Z-metadata.json'), 'utf8')
    )
    expect(metadata).toMatchObject({
      bytes: 6653,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      status: 200,
      capturedAt: '2026-11-08T01:44:13.158881+00:00',
      url: MET_FORECAST_ENDPOINT,
      licence: 'CC BY 4.0',
      attribution: 'MET Malaysia via data.gov.my'
    })
    expect(MET_WARNING_ENDPOINT).toBe('https://api.data.gov.my/weather/warning/')
    expect(MET_FORECAST_ENDPOINT).toBe(
      'https://api.data.gov.my/weather/forecast/?contains=Kuala%20Lumpur@location__location_name'
    )
    expect(warnings()).toHaveLength(4)
    expect(readFileSync(join(fixtures, 'weather-warning-20261105T1313Z.json'))).toEqual(
      readFileSync(join(originals, 'weather-warning-20261105T1313Z.json'))
    )
    expect(forecast()).toHaveLength(21)
  })

  test('preserves all warning strings, blanks null instructions/validity and normalizes source times/key', () => {
    const raw = warnings()
    const rows = parseMetWarnings(raw)
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.names_kl === false)).toBe(true)
    for (const [index, row] of rows.entries()) {
      const source = raw[index]!
      const issue = source.warning_issue as Raw
      for (const field of ['title_en', 'title_bm'] as const) expect(row[field]).toBe(issue[field] as string)
      for (const field of [
        'heading_en',
        'heading_bm',
        'text_en',
        'text_bm',
        'instruction_en',
        'instruction_bm'
      ] as const)
        expect(row[field]).toBe((source[field] ?? '') as string)
      expect(row.issued).toBe(`${issue.issued}+08:00`)
      expect(row.valid_from).toBe(source.valid_from === null ? '' : `${source.valid_from}+08:00`)
      expect(row.valid_to).toBe(source.valid_to === null ? '' : `${source.valid_to}+08:00`)
      expect(row.warning_key).toBe(`${row.issued}·${row.title_en}·${row.valid_from}`)
      expect(row).not.toHaveProperty('poll_id')
    }
    expect(rows[2]!.instruction_en).toBe('')
    expect(rows[3]!.valid_from).toBe('')
  })

  test('retains exactly seven Ds058 dates, all published fields and thunderstorm flags', () => {
    const rows = parseMetForecast(forecast())
    expect(rows).toHaveLength(7)
    expect(rows.map((row) => row.date).sort()).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14'
    ])
    for (const row of rows) {
      const source = forecast().find((raw) => (raw.location as Raw).location_id === 'Ds058' && raw.date === row.date)!
      for (const field of [
        'date',
        'morning_forecast',
        'afternoon_forecast',
        'night_forecast',
        'summary_forecast',
        'summary_when',
        'min_temp',
        'max_temp'
      ] as const)
        expect(row[field]).toBe(source[field] as string | number)
      expect(row.location_id).toBe('Ds058')
      expect(row.afternoon_thunderstorm).toBe(true)
      expect(row).not.toHaveProperty('first_seen_at')
    }
    expect(rows.find((row) => row.date === '2026-11-08')).toMatchObject({
      afternoon_forecast: 'Ribut petir di kebanyakan tempat',
      min_temp: 23,
      max_temp: 33
    })
    expect(rows.find((row) => row.date === '2026-11-14')).toMatchObject({
      afternoon_forecast: 'Ribut petir di beberapa tempat',
      min_temp: 23,
      max_temp: 33
    })
  })
})

describe('MET strict validation with test-only mutations', () => {
  test('rejects malformed envelopes, nested metadata and corrupt last rows', () => {
    for (const payload of [undefined, null, {}, { data: [] }, 'bad', [null], [[]]]) {
      expect(() => parseMetWarnings(payload)).toThrow()
      expect(() => parseMetForecast(payload)).toThrow()
    }
    expect(parseMetWarnings([])).toEqual([])
    const w = warnings()
    w[w.length - 1]!.warning_issue = null
    expect(() => parseMetWarnings(w)).toThrow()
    const f = forecast()
    f[f.length - 1]!.location = null
    expect(() => parseMetForecast(f)).toThrow()
    for (const location of [{}, { location_id: null }, { location_id: '' }, { location_id: 42 }])
      expect(() => parseMetForecast([{ ...f[0], location }])).toThrow()
    expect(() => parseMetForecast([])).toThrow()
  })

  test('ignores identified unbound locations before inspecting their unused fields', () => {
    const raw = forecast().filter((row) => (row.location as Raw).location_id === 'Ds058')
    raw.push({ location: { location_id: 'St009' }, date: null }, { location: { location_id: 'Tn079' } })
    expect(parseMetForecast(raw)).toHaveLength(7)
    expect(() => parseMetForecast([{ location: { location_id: 'St009' } }])).toThrow()
  })

  test('rejects invalid source instants and dates, accepts explicit MYT and rejects reversed validity', () => {
    for (const value of [
      '2026-02-30T21:00:00',
      '2026-11-05T24:00:00',
      '2026-11-05T21:00:00Z',
      '2026-11-05T21:00:00+07:00',
      '',
      null,
      1
    ]) {
      for (const field of ['issued', 'valid_from', 'valid_to']) {
        if (value === null && field !== 'issued') continue
        const raw = warnings()
        if (field === 'issued') (raw[0]!.warning_issue as Raw)[field] = value
        else raw[0]![field] = value
        expect(() => parseMetWarnings(raw)).toThrow()
      }
    }
    const raw = warnings()
    ;(raw[0]!.warning_issue as Raw).issued += '+08:00'
    expect(parseMetWarnings(raw)[0]!.issued).toBe('2026-11-05T20:30:00+08:00')
    raw[0]!.valid_from = '2026-11-11T00:00:00'
    expect(() => parseMetWarnings(raw)).toThrow()
    for (const date of ['2026-02-30', '2026-11-31', '2026-11-08T00:00:00', null, 20261108]) {
      const f = forecast()
      f[0]!.date = date
      expect(() => parseMetForecast(f)).toThrow()
    }
  })

  test('requires string scalar types while preserving genuine empty strings and case', () => {
    for (const field of ['heading_en', 'heading_bm', 'text_en', 'text_bm', 'instruction_en', 'instruction_bm']) {
      const raw = warnings()
      raw[0]![field] = 42
      expect(() => parseMetWarnings(raw)).toThrow()
      raw[0]![field] = null
      if (!field.startsWith('instruction')) expect(() => parseMetWarnings(raw)).toThrow()
      raw[0]![field] = ''
      expect(parseMetWarnings(raw)[0]).toHaveProperty(field, '')
    }
    for (const field of ['title_en', 'title_bm']) {
      const raw = warnings()
      ;(raw[0]!.warning_issue as Raw)[field] = null
      expect(() => parseMetWarnings(raw)).toThrow()
      ;(raw[0]!.warning_issue as Raw)[field] = ''
      expect(parseMetWarnings(raw)[0]).toHaveProperty(field, '')
    }
    for (const field of [
      'morning_forecast',
      'afternoon_forecast',
      'night_forecast',
      'summary_forecast',
      'summary_when'
    ]) {
      for (const invalid of [null, undefined, true, 1]) {
        const raw = forecast()
        raw[0]![field] = invalid
        expect(() => parseMetForecast(raw)).toThrow()
      }
      const raw = forecast()
      raw[0]![field] = ''
      expect(parseMetForecast(raw)[0]).toHaveProperty(field, '')
    }
    const f = forecast()
    f[0]!.afternoon_forecast = 'RIBUT PETIR di beberapa tempat'
    expect(parseMetForecast(f)[0]).toMatchObject({
      afternoon_forecast: f[0]!.afternoon_forecast,
      afternoon_thunderstorm: true
    })
    f[0]!.afternoon_forecast = 'Tiada Hujan'
    expect(parseMetForecast(f)[0]!.afternoon_thunderstorm).toBe(false)
  })

  test('deduplicates identical canonical rows and refuses conflicting keys or dates', () => {
    const w = warnings()
    w.push(structuredClone(w[0]!))
    expect(parseMetWarnings(w)).toHaveLength(4)
    w[w.length - 1]!.text_bm = 'changed'
    expect(() => parseMetWarnings(w)).toThrow(/conflict/i)
    const f = forecast()
    f.push(structuredClone(f[0]!))
    expect(parseMetForecast(f)).toHaveLength(7)
    f[f.length - 1]!.night_forecast = 'changed'
    expect(() => parseMetForecast(f)).toThrow(/conflict/i)
    f[f.length - 1]!.min_temp = '23'
    expect(() => parseMetForecast(f)).toThrow()
  })

  test('preserves zero and rejects invalid temperatures or min greater than max', () => {
    const f = forecast()
    f[0]!.min_temp = 0
    f[0]!.max_temp = 0
    expect(parseMetForecast(f)[0]).toMatchObject({ min_temp: 0, max_temp: 0 })
    for (const field of ['min_temp', 'max_temp']) {
      for (const invalid of [null, undefined, '23', NaN, Infinity, 23.5, true]) {
        const raw = forecast()
        raw[0]![field] = invalid
        expect(() => parseMetForecast(raw)).toThrow()
      }
    }
    f[0]!.min_temp = 1
    expect(() => parseMetForecast(f)).toThrow()
  })

  test('enforces 50000 UTF-16 units on source fields and the derived warning key', () => {
    const raw = warnings()
    raw[0]!.text_en = '😀'.repeat(25000)
    expect(parseMetWarnings(raw)[0]!.text_en.length).toBe(50000)
    raw[0]!.text_en += 'x'
    expect(() => parseMetWarnings(raw)).toThrow()
    const key = warnings()
    ;(key[0]!.warning_issue as Raw).title_en = 'x'.repeat(50000)
    expect(() => parseMetWarnings(key)).toThrow()
    const f = forecast()
    f[0]!.night_forecast = '😀'.repeat(25001)
    expect(() => parseMetForecast(f)).toThrow()
  })

  test('stored warning validation refuses absent or malformed provenance and canonical metadata', () => {
    expect(validateMetWarningRow(stored())).toEqual([])
    for (const field of ['issued', 'first_seen_at', 'http_status', 'latency_ms'] as const) {
      const row = stored()
      delete row[field]
      expect(validateMetWarningRow(row).join(' ')).toContain(field)
    }
    for (const [field, invalid] of [
      ['issued', '2026-02-30T21:00:00+08:00'],
      ['first_seen_at', '2026-11-05T21:00:00'],
      ['http_status', '200'],
      ['http_status', 600],
      ['http_status', 200.5],
      ['latency_ms', -1],
      ['latency_ms', Infinity],
      ['latency_ms', '0'],
      ['names_kl', 'false'],
      ['warning_key', 'wrong'],
      ['text_en', null]
    ] as const) {
      const row = { ...stored(), [field]: invalid } as Row<'warnings'>
      expect(validateMetWarningRow(row).length).toBeGreaterThan(0)
    }
    expect(validateMetWarningRow({ ...stored(), text_en: '😀'.repeat(25001) }).length).toBeGreaterThan(0)
  })

  test('stored published columns are already normalized strings with explicit MYT validity', () => {
    for (const field of ['valid_from', 'valid_to', 'instruction_en', 'instruction_bm'] as const) {
      expect(validateMetWarningRow({ ...stored(), [field]: null } as unknown as Row<'warnings'>).join(' ')).toContain(
        field
      )
    }
    for (const field of ['valid_from', 'valid_to'] as const) {
      expect(validateMetWarningRow({ ...stored(), [field]: '2026-11-05T21:00:00' }).join(' ')).toContain(field)
    }
    const row = stored()
    expect(
      validateMetWarningRow({ ...row, warning_key: `${row.issued}·${row.title_en}·`, valid_from: '', valid_to: '' })
    ).toEqual([])
  })
})
