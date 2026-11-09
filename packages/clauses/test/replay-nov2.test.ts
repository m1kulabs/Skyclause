/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { check, evaluate, explain, snapshotAt } from '../src'
import { sha256 } from '../src/sha256'
import type { ReadingHistory, SheetInput, Window } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}

const captureBytes = readFileSync(`${import.meta.dirname}/fixtures/rainfall-graph-75-20261105T1312Z.json`)
const capture = JSON.parse(captureBytes.toString('utf8')) as JpsCapture

const skyDefault = JSON.parse(readFileSync(`${import.meta.dirname}/../defaults/sky.json`, 'utf8')) as SheetInput

function mytToUtc(mytTimestamp: string): string {
  const iso = new Date(`${mytTimestamp}+08:00`).toISOString()
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso
}

function buildNov2History(): ReadingHistory {
  const readings: ReadingHistory['readings'] = capture.data
    .filter((row) => row.timestamp.startsWith('2026-11-02T'))
    .map((row) => {
      const observedAt = mytToUtc(row.timestamp)
      // Each 5-minute reading is received on the poll 5 minutes after its timestamp (e.g. 15:00 reading received at 15:05 poll)
      const receivedAt = new Date(Date.parse(observedAt) + 5 * 60_000).toISOString().replace('.000Z', 'Z')
      return {
        id: `0232901RF:rain_5m_mm:${observedAt}`,
        sourceId: '0232901RF',
        metric: 'rain_5m_mm',
        observedAt,
        receivedAt,
        value: row.rf,
        valueText: null,
        valueJson: null,
        itemKey: observedAt,
        revision: 1
      }
    })

  // Fresh APIMS and MET sources so only rainfall drives the window transition
  const extraReadings: ReadingHistory['readings'] = [
    {
      id: 'CA16W:api:2026-10-30T22:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-10-30T22:00:00Z',
      receivedAt: '2026-10-30T22:05:00Z',
      value: 55,
      valueText: null,
      valueJson: null,
      itemKey: '2026-10-30T22:00:00Z',
      revision: 1
    },
    {
      id: 'CA16W:api:2026-10-31T22:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-10-31T22:00:00Z',
      receivedAt: '2026-10-31T22:05:00Z',
      value: 58,
      valueText: null,
      valueJson: null,
      itemKey: '2026-10-31T22:00:00Z',
      revision: 1
    },
    {
      id: 'CA16W:api:2026-11-01T22:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-11-01T22:00:00Z',
      receivedAt: '2026-11-01T22:05:00Z',
      value: 60,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-01T22:00:00Z',
      revision: 1
    },
    {
      id: 'CA16W:api:2026-11-02T06:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-11-02T06:00:00Z',
      receivedAt: '2026-11-02T06:00:00Z',
      value: 61,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T06:00:00Z',
      revision: 1
    },
    {
      id: 'CA16W:api:2026-11-02T07:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-11-02T07:00:00Z',
      receivedAt: '2026-11-02T07:00:00Z',
      value: 62,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T07:00:00Z',
      revision: 1
    },
    {
      id: 'CA16W:api:2026-11-02T08:00:00Z',
      sourceId: 'CA16W',
      metric: 'api',
      observedAt: '2026-11-02T08:00:00Z',
      receivedAt: '2026-11-02T08:00:00Z',
      value: 61,
      valueText: null,
      valueJson: null,
      itemKey: '2026-11-02T08:00:00Z',
      revision: 1
    }
  ]

  return {
    sources: [
      {
        id: '0232901RF',
        kind: 'jps_rain',
        cadenceS: 300,
        staleAfterS: 600,
        freshness: 'observed',
        probation: false,
        meta: {}
      },
      {
        id: 'CA16W',
        kind: 'apims',
        cadenceS: 3600,
        staleAfterS: 7200,
        freshness: 'observed',
        probation: false,
        meta: {}
      },
      {
        id: 'met-warn',
        kind: 'met_warning',
        cadenceS: 600,
        staleAfterS: 1200,
        freshness: 'polled',
        probation: false,
        meta: {}
      }
    ],
    polls: [
      { id: 'mw-p1', sourceId: 'met-warn', startedAt: '2026-11-02T07:00:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'mw-p2', sourceId: 'met-warn', startedAt: '2026-11-02T07:10:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'mw-p3', sourceId: 'met-warn', startedAt: '2026-11-02T08:00:00Z', outcome: 'ok', httpStatus: 200 },
      { id: 'mw-p4', sourceId: 'met-warn', startedAt: '2026-11-02T08:30:00Z', outcome: 'ok', httpStatus: 200 }
    ],
    readings: [...readings, ...extraReadings]
  }
}

describe('2 November 2026 stored JPS rainfall replay (SIG-6, CLS-4)', () => {
  const wave1530: Window = {
    id: 'wave-1530',
    startsAt: mytToUtc('2026-11-02T15:30:00'),
    endsAt: mytToUtc('2026-11-02T15:30:00'),
    kind: 'commute_wave',
    tz: 'Asia/Kuala_Lumpur'
  }
  const wave1545: Window = {
    id: 'wave-1545',
    startsAt: mytToUtc('2026-11-02T15:45:00'),
    endsAt: mytToUtc('2026-11-02T15:45:00'),
    kind: 'commute_wave',
    tz: 'Asia/Kuala_Lumpur'
  }

  test('verifies capture provenance, byte-for-byte SHA-256, and totals: trailing sum over (14:00, 16:00] is 63.0 mm and first 60-min total >= 31 mm is 39.0 at 15:00', () => {
    expect(captureBytes.byteLength).toBe(127043)
    expect(sha256(captureBytes)).toBe('25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95')
    const window14to16 = capture.data.filter(
      (r) => r.timestamp > '2026-11-02T14:00:00' && r.timestamp <= '2026-11-02T16:00:00'
    )
    const sum14to16 = window14to16.reduce((s, r) => s + r.rf, 0)
    expect(sum14to16).toBe(63.0)

    const nov2 = capture.data.filter((r) => r.timestamp.startsWith('2026-11-02T'))
    let firstLebat: { timestamp: string; total: number } | null = null
    for (let i = 0; i < nov2.length; i++) {
      const endRow = nov2[i]!
      const endMs = Date.parse(`${endRow.timestamp}+08:00`)
      const startExclusive = endMs - 60 * 60_000
      const total = nov2
        .filter((r) => {
          const ms = Date.parse(`${r.timestamp}+08:00`)
          return ms > startExclusive && ms <= endMs
        })
        .reduce((s, r) => s + r.rf, 0)
      if (total >= 31) {
        firstLebat = { timestamp: endRow.timestamp, total }
        break
      }
    }
    expect(firstLebat).toEqual({ timestamp: '2026-11-02T15:00:00', total: 39.0 })
  })

  test('evaluates 15:04 MYT (Normal, 29.5 mm), 15:05 MYT (Commute disruption, 39.0 mm, 15:45 not_open), 15:15 MYT, and 16:05 MYT (59.5 mm at 15:35)', () => {
    const checked = check(skyDefault, TEST_REGISTRY).sheet!
    const history = buildNov2History()

    // 1. At 15:04 MYT (07:04:00Z): 15:00 reading (received at 15:05) is not yet received; latest is 14:55 (29.5 mm)
    const t1504 = mytToUtc('2026-11-02T15:04:00')
    const snap1504 = snapshotAt(history, TEST_REGISTRY, 'proj-apu', 'sky', t1504)
    const verdicts1504 = evaluate(checked, snap1504, [wave1530, wave1545], t1504)
    const v1530At1504 = verdicts1504.windows.find((w) => w.scope.id === 'wave-1530')!
    expect(v1530At1504.mode).toBe('normal')
    const storm1504 = v1530At1504.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm1504.result).toBe('not_fired')
    expect(storm1504.inputs.find((i) => i.name === 'w.rain_max_60m_mm')?.value).toBe(29.5)

    // 2. At 15:05 MYT (07:05:00Z): 15:00 reading is received -> 39.0 mm -> storm_confirmed fires!
    const t1505 = mytToUtc('2026-11-02T15:05:00')
    const snap1505 = snapshotAt(history, TEST_REGISTRY, 'proj-apu', 'sky', t1505)
    const verdicts1505 = evaluate(checked, snap1505, [wave1530, wave1545], t1505)
    const v1530At1505 = verdicts1505.windows.find((w) => w.scope.id === 'wave-1530')!
    expect(v1530At1505.mode).toBe('commute_disruption')
    const storm1505 = v1530At1505.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm1505.result).toBe('fired')
    expect(storm1505.span).toEqual({
      from: '2026-11-02T07:00:00Z',
      to: '2026-11-02T08:30:00Z',
      complete: false
    })

    const explained1505 = explain(verdicts1505)
    const stormExplained = explained1505.find((e) => e.key === 'storm_confirmed' && e.result === 'fired')!
    expect(stormExplained).toBeDefined()
    expect(stormExplained.cel).toBe('w.rain_max_60m_mm >= 31.0')
    const rainInput = stormExplained.inputs.find((i) => i.name === 'w.rain_max_60m_mm')!
    expect(rainInput.sourceIds).toEqual(['0232901RF'])
    expect(rainInput.value).toBe(39.0)
    expect(rainInput.observedAt).toBe('2026-11-02T07:00:00Z')
    expect(rainInput.ageS).toBe(300)
    expect(rainInput.readingIds.length).toBe(12)

    // At 15:05 MYT, the 15:45 wave's storm_confirmed and flash_flood_risk spans (15:15..16:45 MYT) are not_open with openFrom = 15:15 MYT
    const v1545At1505 = verdicts1505.windows.find((w) => w.scope.id === 'wave-1545')!
    const storm1545At1505 = v1545At1505.clauses.find((c) => c.key === 'storm_confirmed')!
    const flood1545At1505 = v1545At1505.clauses.find((c) => c.key === 'flash_flood_risk')!
    const silent1545At1505 = v1545At1505.clauses.find((c) => c.key === 'silent_input')!
    expect(storm1545At1505.result).toBe('not_open')
    expect(flood1545At1505.result).toBe('not_open')
    expect(silent1545At1505.result).toBe('not_fired')
    expect(v1545At1505.noCall).toBeNull()
    expect(v1545At1505.mode).toBe('normal')
    expect(v1545At1505.openFrom).toBe('2026-11-02T07:15:00Z')

    // 3. At 15:15 MYT (07:15:00Z): 15:45 wave's storm_confirmed opens and fires!
    const t1515 = mytToUtc('2026-11-02T15:15:00')
    const snap1515 = snapshotAt(history, TEST_REGISTRY, 'proj-apu', 'sky', t1515)
    const verdicts1515 = evaluate(checked, snap1515, [wave1530, wave1545], t1515)
    const v1545At1515 = verdicts1515.windows.find((w) => w.scope.id === 'wave-1545')!
    expect(v1545At1515.mode).toBe('commute_disruption')
    expect(v1545At1515.clauses.find((c) => c.key === 'storm_confirmed')?.result).toBe('fired')

    // 4. At 16:05 MYT (08:05:00Z): 15:30 wave holds commute_disruption with span max 59.5 mm reached at 15:35 MYT (07:35:00Z)
    const t1605 = mytToUtc('2026-11-02T16:05:00')
    const snap1605 = snapshotAt(history, TEST_REGISTRY, 'proj-apu', 'sky', t1605)
    const verdicts1605 = evaluate(checked, snap1605, [wave1530, wave1545], t1605)
    const v1530At1605 = verdicts1605.windows.find((w) => w.scope.id === 'wave-1530')!
    expect(v1530At1605.mode).toBe('commute_disruption')
    const storm1605 = v1530At1605.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm1605.result).toBe('fired')
    expect(storm1605.span?.complete).toBe(false)
    const rain1605 = storm1605.inputs.find((i) => i.name === 'w.rain_max_60m_mm')!
    expect(rain1605.value).toBe(59.5)
    expect(rain1605.observedAt).toBe('2026-11-02T07:35:00Z')

    // 5. At 16:30 MYT (08:30:00Z): span is complete
    const t1630 = mytToUtc('2026-11-02T16:30:00')
    const snap1630 = snapshotAt(history, TEST_REGISTRY, 'proj-apu', 'sky', t1630)
    const verdicts1630 = evaluate(checked, snap1630, [wave1530], t1630)
    const storm1630 = verdicts1630.windows[0]!.clauses.find((c) => c.key === 'storm_confirmed')!
    expect(storm1630.span?.complete).toBe(true)
    expect(storm1630.inputs.find((i) => i.name === 'w.rain_max_60m_mm')?.value).toBe(59.5)
  })
})
