import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { acceptanceTotals, loadCapture, deriveSeries, sixtyMinuteTotalAt } from '../../features/landing/generator'
import { REPLAY_60M } from '../../features/landing/data'

describe('landing replay generator', () => {
  test('re-derives 29.5, 39.0, 59.5 and 24.0 from the capture', () => {
    const capture = loadCapture()
    expect(acceptanceTotals(capture)).toEqual({ at1455: 29.5, at1500: 39, at1535: 59.5, at1600: 24 })
  })

  test('shipped totals match the generator', () => {
    const capture = loadCapture()
    const derived = deriveSeries(capture, '2026-11-02T14:00:00', '2026-11-02T16:30:00')
    expect(derived).toEqual([...REPLAY_60M])
  })

  test('build output contains no 5-minute value and no capture file', () => {
    const dir = new URL('../../features/landing/', import.meta.url).pathname
    const files = readdirSync(dir)
    // Capture file must not live in the landing bundle dir.
    expect(files).not.toContain('rainfall-graph-75-20261105T1312Z.json')
    // Shipped totals hold only 60-minute totals: every value is one of the derived totals.
    const dataSource = readFileSync(join(dir, 'data.ts'), 'utf8')
    expect(dataSource).not.toContain('rainfall-graph-75')
    for (const point of REPLAY_60M) {
      expect(sixtyMinuteTotalAt(loadCapture(), point.at)).toBe(point.value)
    }
    // No file in the landing dir may import the raw capture path.
    for (const file of files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      const text = readFileSync(join(dir, file), 'utf8')
      if (file === 'generator.ts') continue
      expect(text, file).not.toContain('rainfall-graph-75-20261105T1312Z.json')
      expect(text, file).not.toContain('readFileSync')
    }
    void statSync(dir)
  })
})
