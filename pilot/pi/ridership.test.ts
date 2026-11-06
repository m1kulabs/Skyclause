// Tests for the Rapid Rail reduction (#68): real capture data, the schema check,
// the pending line, the 7-newest rule and the revision memory.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  blankState,
  buildNote,
  checkPostResult,
  coveredNight,
  dayOf,
  mytToday,
  newestNights,
  nightsToPost,
  parseMetadata,
  parseNote,
  pendingLine,
  readingId,
  reduceNightlies,
  rememberPosted,
  type NightTotal
} from './ridership.ts'

const fixtures = join(import.meta.dir, '..', 'fixtures')
const extract = JSON.parse(
  readFileSync(join(fixtures, 'rapidrail-sp17-extract-20261106T1456Z.json'), 'utf8')
) as Record<string, unknown>[]
const daily = JSON.parse(readFileSync(join(fixtures, 'rapidrail-sp17-daily.json'), 'utf8')) as Record<string, number>
const metadata = readFileSync(join(fixtures, 'ridership-od-rapidrail-daily-20261106T1456Z.json'), 'utf8')

const nights = (days: Record<string, number>): NightTotal[] =>
  Object.entries(days)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, exits]) => ({ date, exits }))

describe('reduceNightlies on the capture', () => {
  test('excludes the A0 total row: 10 January 2026 sums to 38,447 exits', () => {
    const reduced = reduceNightlies(extract)
    if ('schemaError' in reduced) throw new Error(reduced.schemaError)
    expect(reduced.nights.find((night) => night.date === '2026-01-10')).toEqual({ date: '2026-01-10', exits: 38447 })
  })

  test('the A0 row doubles the sum, so including it would report 76,894', () => {
    let withA0 = 0
    for (const row of extract) {
      if (row.date === '2026-01-10') withA0 += Number(row.ridership)
    }
    expect(withA0).toBe(76894)
  })

  test('sums the concert nights: 4 November 2026 is 33,804', () => {
    const reduced = reduceNightlies(extract)
    if ('schemaError' in reduced) throw new Error(reduced.schemaError)
    expect(reduced.nights.find((night) => night.date === '2026-11-04')).toEqual({ date: '2026-11-04', exits: 33804 })
  })

  test('the committed daily series matches the extract on every sample day', () => {
    const reduced = reduceNightlies(extract)
    if ('schemaError' in reduced) throw new Error(reduced.schemaError)
    for (const night of reduced.nights) expect(daily[night.date]).toBe(night.exits)
  })

  test('accepts parquet Date timestamps as well as YYYY-MM-DD strings', () => {
    const dated = extract.map((row) => ({ ...row, date: new Date(`${row.date}T00:00:00Z`) }))
    const reduced = reduceNightlies(dated)
    if ('schemaError' in reduced) throw new Error(reduced.schemaError)
    expect(reduced.nights.find((night) => night.date === '2026-01-10')).toEqual({ date: '2026-01-10', exits: 38447 })
  })
})

describe('reduceNightlies schema check (feeds SIG-11)', () => {
  test('names a missing or renamed column', () => {
    const renamed = extract.map((row) => {
      const { destination: _dropped, ...rest } = row
      return { ...rest, destination_station: 'SP17: Bukit Jalil' }
    })
    expect(reduceNightlies(renamed)).toEqual({ schemaError: 'column "destination" is missing or renamed' })
  })

  test('names a retyped ridership column', () => {
    const retyped = extract.map((row) => ({ ...row, ridership: String(row.ridership) }))
    expect(reduceNightlies(retyped)).toEqual({ schemaError: 'column "ridership" is retyped (expected a number)' })
  })

  test('names a retyped date column', () => {
    const retyped = extract.map((row) => ({ ...row, date: 20260110 }))
    expect(reduceNightlies(retyped)).toEqual({
      schemaError: 'column "date" is retyped (expected a timestamp or YYYY-MM-DD)'
    })
  })

  test('names an absent SP17 destination', () => {
    const without = extract.filter((row) => row.destination !== 'SP17: Bukit Jalil')
    expect(reduceNightlies(without)).toEqual({ schemaError: 'destination "SP17: Bukit Jalil" is absent' })
  })

  test('names an absent A0 origin', () => {
    const without = extract.filter((row) => row.origin !== 'A0: All Stations')
    expect(reduceNightlies(without)).toEqual({ schemaError: 'origin "A0: All Stations" is absent' })
  })
})

describe('metadata times (read as MYT)', () => {
  test('parses the captured metadata stamps', () => {
    const parsed = parseMetadata(metadata)
    if (!('stamps' in parsed)) throw new Error(parsed.problem)
    expect(parsed.stamps).toEqual({
      dataAsOf: '2026-11-05 23:59',
      lastUpdated: '2026-11-06 16:05',
      nextUpdate: '2026-11-07 22:00'
    })
  })

  test('data_as_of covers the night it names', () => {
    expect(coveredNight('2026-11-05 23:59')).toBe('2026-11-05')
  })

  test('rejects metadata without readable stamps', () => {
    expect(parseMetadata('{}')).toEqual({ problem: 'the metadata has no readable "data_as_of"' })
    expect(parseMetadata('not json')).toEqual({ problem: 'the metadata is not JSON' })
  })

  test('a late file logs pending until HH:MM from next_update', () => {
    expect(pendingLine('2026-11-07 22:00')).toBe('pending until 22:00')
  })

  test('mytToday reads the clock as MYT', () => {
    expect(mytToday(Date.parse('2026-11-06T14:56:45Z'))).toBe('2026-11-06')
    expect(mytToday(Date.parse('2026-11-06T15:30:00Z'))).toBe('2026-11-06')
    expect(mytToday(Date.parse('2026-11-06T16:30:00Z'))).toBe('2026-11-07')
  })
})

describe('what each run posts', () => {
  const all = nights(daily)

  test('posts the 7 newest nights the file covers, and no newer', () => {
    expect(newestNights(all, '2026-11-05 23:59').map((night) => night.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05'
    ])
  })

  test('a new night posts at revision 1', () => {
    const { rows, upToDate } = nightsToPost([{ date: '2026-11-05', exits: 35164 }], '2026-11-05 23:59', blankState())
    expect(upToDate).toBe(false)
    expect(rows).toEqual([{ date: '2026-11-05', value: 35164, revision: 1 }])
  })

  test('repeats are skipped', () => {
    const state = rememberPosted(blankState(), '2026-11-05 23:59', [{ date: '2026-11-05', value: 35164, revision: 1 }])
    expect(nightsToPost([{ date: '2026-11-05', exits: 35164 }], '2026-11-05 23:59', state)).toEqual({
      rows: [],
      upToDate: true
    })
  })

  test('a revised count reposts at revision + 1', () => {
    const state = rememberPosted(blankState(), '2026-11-05 23:59', [{ date: '2026-11-05', value: 35164, revision: 1 }])
    const { rows } = nightsToPost([{ date: '2026-11-05', exits: 35199 }], '2026-11-05 23:59', state)
    expect(rows).toEqual([{ date: '2026-11-05', value: 35199, revision: 2 }])
  })
})

describe('notes, reading IDs and post results', () => {
  test('the note round-trips the ticket fields', () => {
    const note = buildNote({
      runner: 'actions',
      deviceTime: '2026-11-06T22:56:45+08:00',
      postedAt: '2026-11-06T22:56:50+08:00',
      headerAgeS: 549,
      dataAsOf: '2026-11-05 23:59'
    })
    expect(parseNote(note)).toEqual({
      runner: 'actions',
      device_time: '2026-11-06T22:56:45+08:00',
      posted_at: '2026-11-06T22:56:50+08:00',
      header_age_s: 549,
      data_as_of: '2026-11-05 23:59'
    })
  })

  test('the note rejects anything but the ticket shape', () => {
    expect(parseNote('not json')).toBeNull()
    expect(parseNote(JSON.stringify({ runner: 'pi' }))).toBeNull()
    expect(
      parseNote(JSON.stringify({ runner: 'cron', device_time: 'x', posted_at: 'y', header_age_s: 1, data_as_of: 'z' }))
    ).toBeNull()
  })

  test('reading IDs read source:metric:date', () => {
    expect(readingId('2026-01-10')).toBe('SP17:sp17_exits:2026-01-10')
  })

  test('dayOf reads parquet Dates, millis and day strings', () => {
    expect(dayOf(new Date('2026-01-10T00:00:00Z'))).toBe('2026-01-10')
    expect(dayOf(Date.parse('2026-01-10T00:00:00Z'))).toBe('2026-01-10')
    expect(dayOf('2026-01-10')).toBe('2026-01-10')
    expect(dayOf('2026-01-10T00:00:00.000Z')).toBe('2026-01-10')
    expect(dayOf('10/01/2026')).toBeNull()
    expect(dayOf(undefined)).toBeNull()
  })

  test('checkPostResult passes duplicates through and names failures', () => {
    expect(checkPostResult({ ok: true, duplicate: true })).toEqual({ ok: true, duplicate: true })
    expect(checkPostResult({ ok: true, duplicate: false })).toEqual({ ok: true, duplicate: false })
    expect(checkPostResult({ ok: false, error: 'bad token' })).toEqual({ ok: false, error: 'bad token' })
    expect(checkPostResult('nope')).toEqual({ ok: false, error: 'the reply is not a post result' })
  })
})
