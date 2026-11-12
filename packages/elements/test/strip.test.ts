import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { layoutStrip, stripSvg } from '../src/strip'
import { stripFromCapture } from './fixtures/generate'

const here = dirname(fileURLToPath(import.meta.url))

describe('layoutStrip on the labelled 2 November replay', () => {
  test('rain lines share their lane y positions with the matching ticks', () => {
    const strip = stripFromCapture({ replay: false })
    const layout = layoutStrip({
      ...strip,
      rain5: [
        { at: strip.from, value: 5, state: 'received' },
        { at: strip.to, value: 0, state: 'received' }
      ],
      rain60: [
        { at: strip.from, value: 40 },
        { at: strip.to, value: 0 }
      ]
    })
    const rain5TickY = layout.lanes.find((lane) => lane.key === 'rain5')!.ticks.find((tick) => tick.value === 5)!.y
    const rain60TickY = layout.lanes.find((lane) => lane.key === 'rain60')!.ticks.find((tick) => tick.value === 40)!.y

    expect(Number(layout.rain5Path.match(/^[ML][^,]+,([0-9.]+)/)![1])).toBe(rain5TickY)
    expect(Number(layout.rain60Path.match(/^[ML][^,]+,([0-9.]+)/)![1])).toBeCloseTo(rain60TickY, 1)
  })

  test('the 60-minute lane crosses the Lebat line at 15:00 with 39.0 mm', () => {
    const strip = stripFromCapture({ replay: true })
    const layout = layoutStrip(strip)

    const at1500 = strip.rain60.find((p) => p.at === '2026-11-02T07:00:00Z')
    expect(at1500?.value).toBe(39)
    expect(layout.crossings).toHaveLength(1)
    expect(layout.crossings[0]!.at).toBe('2026-11-02T07:00:00Z')
    expect(layout.crossings[0]!.value).toBe(39)
    expect(layout.crossings[0]!.label).toContain('Lebat at 15:00')
    expect(layout.lanes.find((lane) => lane.key === 'rain60')!.ticks.map((t) => t.label)).toEqual([
      '0',
      '20',
      '40',
      '60'
    ])
    expect(layout.lanes.find((lane) => lane.key === 'rain5')!.ticks.map((t) => t.label)).toEqual(['0', '5', '10'])
    expect(layout.xTicks.length).toBeGreaterThanOrEqual(4)
    expect(layout.xTicks.length).toBeLessThanOrEqual(8)
  })

  test('a removed reading yields a gap, not a zero', () => {
    const strip = stripFromCapture({ removeAt: '2026-11-02T07:00:00Z', replay: false })
    const layout = layoutStrip(strip)
    expect(layout.rain5Gaps).toBeGreaterThan(0)
    expect(layout.rain5Path).not.toContain('NaN')
    const at1500 = strip.rain60.find((p) => p.at === '2026-11-02T07:00:00Z')
    expect(at1500?.value).toBeNull()
  })

  test('an error span yields a cross', () => {
    const strip = stripFromCapture({
      errorSpan: { from: '2026-11-02T06:55:00Z', to: '2026-11-02T07:00:00Z' },
      replay: false
    })
    const layout = layoutStrip(strip)
    expect(layout.errorMarks).toHaveLength(1)
    const svg = stripSvg(layout)
    expect(svg).toContain('<g stroke="currentColor" stroke-width="1.5" data-error="true">')
  })

  test('replay geometry is flagged and styled apart', () => {
    const replay = layoutStrip(stripFromCapture({ replay: true }))
    const live = layoutStrip(stripFromCapture({ replay: false }))
    expect(replay.isReplay).toBe(true)
    expect(live.isReplay).toBe(false)
    expect(replay.replayBadge).toContain('Replay')
    expect(replay.replayBadge).toContain('station 75')
    expect(live.replayBadge).toBeNull()

    const replaySvg = stripSvg(replay)
    const liveSvg = stripSvg(live)
    expect(replaySvg).toContain('data-replay="true"')
    expect(replaySvg).toContain('stroke-dasharray="4 2"')
    expect(liveSvg).not.toContain('data-replay="true"')
    expect(replaySvg).not.toBe(liveSvg)
  })
})

describe('stripSvg', () => {
  test('output is deterministic', () => {
    const layout = layoutStrip(stripFromCapture({ replay: true }))
    expect(stripSvg(layout)).toBe(stripSvg(layout))
    expect(stripSvg(layoutStrip(stripFromCapture({ replay: true })))).toBe(stripSvg(layout))
  })

  test('a lane with no data is not drawn', () => {
    const strip = stripFromCapture({ replay: false })
    const layout = layoutStrip({ ...strip, warnings: [], crowdPeriods: [], ages: [] })
    expect(layout.lanes.map((lane) => lane.key).sort()).toEqual(['rain5', 'rain60'])
    const svg = stripSvg(layout)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Lebat 31 mm')
  })

  test('packages/elements imports nothing outside contracts and i18n', () => {
    const source = readFileSync(join(here, '..', 'src', 'strip.ts'), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
    for (const spec of imports) {
      expect(
        spec.startsWith('@skyclause/contracts') ||
          spec.startsWith('@skyclause/i18n') ||
          spec.startsWith('node:') ||
          spec.startsWith('./'),
        spec
      ).toBe(true)
    }
    const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['@skyclause/contracts', '@skyclause/i18n'])
  })

  test('the capture copy is byte for byte with its fixture record', () => {
    const bytes = readFileSync(join(here, 'fixtures', 'rainfall-graph-75-20261105T1312Z.json'))
    const sha = createHash('sha256').update(bytes).digest('hex')
    const record = JSON.parse(readFileSync(join(here, 'fixtures', 'fixtures.json'), 'utf8')) as Array<{
      file: string
      sha256: string
      station_id: string
    }>
    expect(record[0]!.sha256).toBe(sha)
    expect(record[0]!.sha256).toBe('25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95')
    expect(record[0]!.station_id).toBe('0232901RF')
  })
})

describe('window capsules', () => {
  const day = {
    from: '2026-11-02T00:00:00Z',
    to: '2026-11-02T12:00:00Z',
    now: '2026-11-02T06:00:00Z',
    rain5: [],
    rain60: []
  }

  test('each window is a capsule filled by its call, with its glyph and word, left to right', () => {
    const layout = layoutStrip({
      ...day,
      windows: [
        { id: 'late', from: '2026-11-02T08:00:00Z', to: '2026-11-02T11:30:00Z', state: 'hybrid_recommended' },
        { id: 'early', from: '2026-11-02T01:00:00Z', to: '2026-11-02T01:15:00Z', state: 'no_call' },
        { id: 'open', from: '2026-11-02T04:00:00Z', to: '2026-11-02T05:00:00Z', state: null, title: 'Lecture' }
      ]
    })
    expect(layout.windowMarks.map((mark) => [mark.id, mark.tone, mark.glyph, mark.word])).toEqual([
      ['early', 'no-call', 'dashed_ring', 'No call'],
      ['open', 'pending', null, null],
      ['late', 'hybrid-recommended', 'filled_square', 'Hybrid recommended']
    ])
    expect(layout.windowsY).not.toBeNull()
    const svg = stripSvg(layout)
    expect(svg).toContain('data-window="late" data-state="hybrid_recommended"')
    expect(svg).toMatch(/<rect [^>]*rx="12" fill="#ea5a44" data-tone="hybrid-recommended" data-fill="true"\/>/)
    expect(svg).toContain('stroke-dasharray="4 3" data-tone="no-call"')
    expect(svg).toContain('<title>Hybrid recommended</title>')
    // A 15-minute window is too short for its word, so it keeps its glyph and its title carries the word.
    expect(svg).not.toContain('>No call</text>')
    expect(svg).toContain('>Hybrid recommended</text>')
    expect(stripSvg(layout, { windowLane: false })).not.toContain('data-window=')
  })

  test('a lone window without its call is a pending capsule and keeps its span band', () => {
    const layout = layoutStrip({ ...day, window: { from: '2026-11-02T02:00:00Z', to: '2026-11-02T03:00:00Z' } })
    expect(layout.windowMarks).toHaveLength(1)
    expect(layout.windowMarks[0]!.tone).toBe('pending')
    expect(stripSvg(layout)).toContain('data-window-span="true"')
  })

  test('now is marked only inside the span', () => {
    expect(stripSvg(layoutStrip(day))).toContain('data-now="true"')
    expect(stripSvg(layoutStrip({ ...day, now: '2026-11-02T13:00:00Z' }))).not.toContain('data-now="true"')
  })

  test('a draft call is edged in its mode instead of filled', () => {
    const svg = stripSvg(
      layoutStrip({
        ...day,
        windows: [
          { id: 'd', from: '2026-11-02T02:00:00Z', to: '2026-11-02T06:00:00Z', state: 'outdoor_limited', draft: true }
        ]
      })
    )
    expect(svg).toContain('data-draft="true"')
    expect(svg).toMatch(/fill="none" stroke="#f6dc8e" stroke-width="2" data-tone="outdoor-limited" data-stroke="true"/)
  })
})
