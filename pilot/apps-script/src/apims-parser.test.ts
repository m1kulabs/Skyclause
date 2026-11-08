import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APIMS_ENDPOINT,
  APIMS_HISTORY_ENDPOINT,
  APIMS_STATIONS,
  apimsHistoryKey,
  apimsHistoryUrl,
  parseApimsHistory,
  parseApimsLatest,
  type ApimsStationId
} from './apims-parser.ts'

const FIXTURES = join(import.meta.dir, '../../fixtures')
const ORIGINALS = join(import.meta.dir, '../../../docs/sources/eqms.doe.gov.my')
const MANIFEST_FILE = 'apitablehourly-20261107-capture-manifest.json'
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'apims', MANIFEST_FILE), 'utf8')) as {
  requests: {
    file: string
    stateId: 14 | 10 | 16
    stationId: ApimsStationId
    requestedThroughMyt: string
    bytes: number
    sha256: string
    boundStationRows: number
  }[]
  invalidDatetimeProbe: { file: string; bytes: number; sha256: string }
}
type RawRow = Record<string, unknown>
const allowed: ApimsStationId[] = ['CA16W', 'CA19B', 'CA17W']
const request = { stationId: 'CA16W', stateId: 14, end: '2026-11-02T23:00:00+08:00' } as const
function latest(): { data: RawRow[] } {
  return JSON.parse(readFileSync(join(FIXTURES, 'mapcaqm-20261105T1313Z.json'), 'utf8'))
}
function history(): { api_table_hourly: RawRow[] } {
  return capture(
    manifest.requests.find((entry) => entry.stateId === 14 && entry.requestedThroughMyt.startsWith('2026-11-02'))!.file
  )
}
function capture(file: string) {
  return JSON.parse(readFileSync(join(FIXTURES, 'apims', file), 'utf8'))
}
function bound(rows: RawRow[]): RawRow {
  return rows.find((row) => row.STATION_ID === 'CA16W')!
}

describe('APIMS real captures', () => {
  test('preserves all thirteen bodies and the manifest byte for byte', () => {
    expect(readFileSync(join(FIXTURES, 'apims', MANIFEST_FILE))).toEqual(readFileSync(join(ORIGINALS, MANIFEST_FILE)))
    expect(manifest.requests).toHaveLength(12)
    for (const entry of [...manifest.requests, manifest.invalidDatetimeProbe]) {
      const bytes = readFileSync(join(FIXTURES, 'apims', entry.file))
      expect(bytes).toEqual(readFileSync(join(ORIGINALS, entry.file)))
      expect(bytes.length).toBe(entry.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
    }
  })

  test('parses the latest capture into exactly three bound hourly observations', () => {
    const result = parseApimsLatest(latest(), allowed)
    expect(result.diagnostics).toEqual([])
    expect(result.readings.sort((a, b) => a.stationId.localeCompare(b.stationId))).toEqual([
      { stationId: 'CA16W', observedAt: '2026-11-05T21:00:00+08:00', value: 67, className: 'Moderate' },
      { stationId: 'CA17W', observedAt: '2026-11-05T21:00:00+08:00', value: 62, className: 'Moderate' },
      { stationId: 'CA19B', observedAt: '2026-11-05T21:00:00+08:00', value: 57, className: 'Moderate' }
    ])
    expect(parseApimsLatest(latest(), []).readings).toEqual([])
  })

  test('pins the captured station definitions and endpoints', () => {
    expect(APIMS_ENDPOINT).toBe('https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm')
    expect(APIMS_HISTORY_ENDPOINT).toBe('https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly')
    expect(APIMS_STATIONS).toEqual([
      { id: 'CA16W', stateId: 14, name: 'Cheras, W.P. KUALA LUMPUR' },
      { id: 'CA19B', stateId: 10, name: 'Petaling Jaya, SELANGOR' },
      { id: 'CA17W', stateId: 16, name: 'Putrajaya, W.P. PUTRAJAYA' }
    ])
  })

  test('parses 25 state14 hours including the real 06:00 value without inventing a class', () => {
    const result = parseApimsHistory(history(), request)
    expect(result.readings).toHaveLength(25)
    expect(result.diagnostics).toEqual([])
    expect(result.readings.find((row) => row.observedAt === '2026-11-02T06:00:00+08:00')).toEqual({
      stationId: 'CA16W',
      observedAt: '2026-11-02T06:00:00+08:00',
      value: 83
    })
    expect(result.readings.every((row) => row.stationId === 'CA16W' && !('className' in row))).toBe(true)
  })

  test('each state retains 73 distinct captured hours and diagnoses its empty 31 October response', () => {
    for (const station of APIMS_STATIONS) {
      const values = new Map<string, number>()
      for (const entry of manifest.requests.filter((entry) => entry.stationId === station.id)) {
        const result = parseApimsHistory(capture(entry.file), {
          stationId: station.id,
          stateId: station.stateId,
          end: `${entry.requestedThroughMyt}+08:00`
        })
        expect(result.readings).toHaveLength(entry.boundStationRows)
        if (entry.boundStationRows === 0) expect(result.diagnostics.join(' ')).toContain(station.id)
        else expect(result.diagnostics).toEqual([])
        for (const row of result.readings) {
          if (values.has(row.observedAt)) expect(values.get(row.observedAt)).toBe(row.value)
          values.set(row.observedAt, row.value)
        }
      }
      expect(values.size).toBe(73)
    }
  })

  test('rejects the preserved ignored-datetime response outside the requested interval', () => {
    expect(() => parseApimsHistory(capture(manifest.invalidDatetimeProbe.file), request)).toThrow(/interval|window/i)
  })
})

describe('APIMS validation with test-only mutations', () => {
  test('preserves zero for both feeds', () => {
    const current = latest()
    bound(current.data).API = 0
    expect(parseApimsLatest(current, allowed).readings.find((row) => row.stationId === 'CA16W')!.value).toBe(0)
    const past = history()
    const row = bound(past.api_table_hourly)
    row.API = 0
    expect(
      parseApimsHistory(past, request).readings.find((item) => item.observedAt === `${row.DATETIME}+08:00`)!.value
    ).toBe(0)
  })

  for (const invalid of [undefined, null, -1, '67', NaN, Infinity]) {
    test(`omits invalid API ${String(invalid)} while valid peers survive`, () => {
      const current = latest()
      const row = bound(current.data)
      if (invalid === undefined) delete row.API
      else row.API = invalid
      const result = parseApimsLatest(current, allowed)
      expect(result.readings).toHaveLength(2)
      expect(result.readings.some((item) => item.stationId === 'CA16W')).toBe(false)
      expect(result.diagnostics.join(' ')).toContain('CA16W')
      const past = history()
      bound(past.api_table_hourly).API = invalid
      const parsed = parseApimsHistory(past, request)
      expect(parsed.readings).toHaveLength(24)
      expect(parsed.diagnostics.join(' ')).toContain('CA16W')
    })
  }

  for (const payload of [null, [], 'bad', 1, {}, { data: null }, { data: [null] }, { data: [[]] }]) {
    test(`rejects a malformed latest envelope or row: ${JSON.stringify(payload)}`, () => {
      expect(() => parseApimsLatest(payload, allowed)).toThrow()
    })
  }
  for (const payload of [
    null,
    [],
    'bad',
    1,
    {},
    { api_table_hourly: null },
    { api_table_hourly: [null] },
    { api_table_hourly: [[]] }
  ]) {
    test(`rejects a malformed history envelope or row: ${JSON.stringify(payload)}`, () => {
      expect(() => parseApimsHistory(payload, request)).toThrow()
    })
  }

  for (const [field, invalid] of [
    ['STATION_ID', null],
    ['STATE_ID', 10],
    ['STATE_ID', '14'],
    ['STATION_LOCATION', null],
    ['STATION_LOCATION', ''],
    ['RECORD_DT', null],
    ['CLASS', undefined],
    ['CLASS', null],
    ['CLASS', '']
  ] as const) {
    test(`rejects malformed required latest metadata ${field}=${String(invalid)}`, () => {
      const payload = latest()
      bound(payload.data)[field] = invalid
      expect(() => parseApimsLatest(payload, allowed)).toThrow()
    })
  }

  for (const timestamp of [
    '2026-02-30T21:00:00',
    '2026-11-05T24:00:00',
    '2026-11-05T21:01:00',
    '2026-11-05T21:00:01',
    '2026-11-05T21:00:00Z',
    '2026-11-05T21:00:00+07:00',
    '2026-11-05 21:00:00'
  ]) {
    test(`rejects invalid source hours ${timestamp}`, () => {
      const current = latest()
      bound(current.data).RECORD_DT = timestamp
      expect(() => parseApimsLatest(current, allowed)).toThrow()
      const past = history()
      bound(past.api_table_hourly).DATETIME = timestamp
      expect(() => parseApimsHistory(past, request)).toThrow()
    })
  }

  test('accepts explicit MYT source offsets and preserves supplied historical class', () => {
    const current = latest()
    bound(current.data).RECORD_DT += '+08:00'
    expect(parseApimsLatest(current, allowed).readings).toHaveLength(3)
    const past = history()
    const row = bound(past.api_table_hourly)
    row.DATETIME += '+08:00'
    row.CLASS = 'Moderate'
    expect(parseApimsHistory(past, request).readings[0]!.className).toBe('Moderate')
  })

  test('collapses identical numeric duplicates to the first source metadata and rejects conflicts', () => {
    const current = latest()
    current.data.push({ ...bound(current.data), CLASS: 'Good' })
    expect(parseApimsLatest(current, allowed).readings).toHaveLength(3)
    expect(parseApimsLatest(current, allowed).readings.find((row) => row.stationId === 'CA16W')!.className).toBe(
      'Moderate'
    )
    current.data[current.data.length - 1]!.API = 99
    expect(() => parseApimsLatest(current, allowed)).toThrow(/conflict/i)
    const past = history()
    past.api_table_hourly.push({ ...bound(past.api_table_hourly), CLASS: 'Moderate' })
    expect(parseApimsHistory(past, request).readings).toHaveLength(25)
    expect(parseApimsHistory(past, request).readings[0]).not.toHaveProperty('className')
    past.api_table_hourly[past.api_table_hourly.length - 1]!.API = 99
    expect(() => parseApimsHistory(past, request)).toThrow(/conflict/i)
  })

  test('validates every bound row including a corrupt final duplicate', () => {
    const current = latest()
    current.data.push({ ...bound(current.data), RECORD_DT: 'bad' })
    expect(() => parseApimsLatest(current, allowed)).toThrow()
    const past = history()
    past.api_table_hourly[past.api_table_hourly.length - 1]!.DATETIME = 'bad'
    expect(() => parseApimsHistory(past, request)).toThrow()
  })

  test('diagnoses missing bound stations and ignores valid unbound stations', () => {
    const current = latest()
    current.data = current.data.filter((row) => row.STATION_ID !== 'CA16W')
    const result = parseApimsLatest(current, allowed)
    expect(result.readings).toHaveLength(2)
    expect(result.diagnostics.join(' ')).toContain('CA16W')
    const past = history()
    past.api_table_hourly = past.api_table_hourly.filter((row) => row.STATION_ID !== 'CA16W')
    expect(parseApimsHistory(past, request).readings).toEqual([])
    expect(parseApimsHistory(past, request).diagnostics.join(' ')).toContain('CA16W')
  })

  for (const [field, invalid] of [
    ['STATE_ID', 10],
    ['STATION_LOCATION', null],
    ['DATETIME', null],
    ['CLASS', null]
  ] as const) {
    test(`rejects malformed bound history metadata ${field}`, () => {
      const past = history()
      bound(past.api_table_hourly)[field] = invalid
      expect(() => parseApimsHistory(past, request)).toThrow()
    })
  }

  for (const outside of ['2026-11-01T22:00:00', '2026-11-03T00:00:00']) {
    test(`rejects history outside the inclusive 25-hour window: ${outside}`, () => {
      const past = history()
      bound(past.api_table_hourly).DATETIME = outside
      expect(() => parseApimsHistory(past, request)).toThrow(/interval|window/i)
    })
  }

  test('rejects a request station/state mismatch', () => {
    expect(() => parseApimsHistory(history(), { ...request, stateId: 10 })).toThrow()
  })
})

describe('APIMS history request identity', () => {
  test('uses the validated explicit MYT hour in request identity and encodes only its offsetless query', () => {
    expect(apimsHistoryUrl(14, request.end)).toBe(
      `${APIMS_HISTORY_ENDPOINT}?stateid=14&datetime=2026-11-02T23%3A00%3A00`
    )
    expect(apimsHistoryKey(14, request.end)).toBe('apims:backfill:14:2026-11-02T23:00:00+08:00')
  })
  for (const end of [
    '2026-11-02T23:00:00',
    '2026-02-30T23:00:00+08:00',
    '2026-11-02T23:01:00+08:00',
    '2026-11-02T23:00:00Z',
    '2026-11-02T23:00:00+07:00'
  ]) {
    test(`rejects invalid request hour ${end}`, () => {
      expect(() => apimsHistoryUrl(14, end)).toThrow()
      expect(() => apimsHistoryKey(14, end)).toThrow()
      expect(() => parseApimsHistory(history(), { ...request, end })).toThrow()
    })
  }
})
