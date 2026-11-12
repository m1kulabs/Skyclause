import { describe, expect, test } from 'vitest'
import { MAX_READING_ROWS, readingRows } from '../../features/data-components/readings-table'

const FIVE = 300_000
const at = (ms: number) => new Date(ms).toISOString()
const start = Date.parse('2026-11-01T16:00:00Z')

describe('readingRows', () => {
  test('every reading is a row when there are few, from the union of both series by time', () => {
    const { rows, bucketMinutes } = readingRows(
      [{ at: at(start), value: 1, state: 'received' }],
      [
        { at: at(start), value: 4 },
        { at: at(start + FIVE), value: 5 }
      ]
    )
    expect(bucketMinutes).toBeNull()
    expect(rows.map((row) => [row.rain5, row.rain60])).toEqual([
      [1, 4],
      [null, 5]
    ])
  })

  test('matches the same instant written in two forms', () => {
    const { rows } = readingRows(
      [{ at: '2026-11-02T06:35:00Z', value: 2, state: 'received' }],
      [{ at: '2026-11-02T06:35:00.000Z', value: 7 }]
    )
    expect(rows).toEqual([{ at: '2026-11-02T06:35:00Z', rain5: 2, rain60: 7 }])
  })

  test('a day of readings every five minutes is summarised by the smallest stretch that fits, keeping each peak', () => {
    const times = Array.from({ length: 288 }, (_, i) => start + i * FIVE)
    const rain5 = times.map((time, i) => ({ at: at(time), value: i === 100 ? 40 : 1, state: 'received' as const }))
    const rain60 = times.map((time) => ({ at: at(time), value: 3 }))
    const { rows, bucketMinutes } = readingRows(rain5, rain60)
    expect(rows.length).toBeLessThanOrEqual(MAX_READING_ROWS)
    expect(bucketMinutes).toBe(30)
    expect(Math.max(...rows.map((row) => row.rain5!))).toBe(40)
    expect(rows[0]!.at).toBe('2026-11-01T16:00:00.000Z')
  })

  test('two days of readings stay under the cap too', () => {
    const times = Array.from({ length: 576 }, (_, i) => start + i * FIVE)
    const { rows, bucketMinutes } = readingRows(
      times.map((time) => ({ at: at(time), value: 1, state: 'received' as const })),
      times.map((time) => ({ at: at(time), value: 2 }))
    )
    expect(rows.length).toBeLessThanOrEqual(MAX_READING_ROWS)
    expect(bucketMinutes).toBe(60)
  })

  test('a missing value stays missing in a summarised row', () => {
    const times = Array.from({ length: 100 }, (_, i) => start + i * FIVE)
    const { rows } = readingRows(
      [],
      times.map((time) => ({ at: at(time), value: null }))
    )
    expect(rows.every((row) => row.rain5 === null && row.rain60 === null)).toBe(true)
  })
})
