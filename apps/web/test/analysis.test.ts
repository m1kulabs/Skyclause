import { describe, expect, expectTypeOf, it } from 'vitest'
import { metricValue } from '../features/data-components/metrics'
import {
  analysisState,
  analysisQuery,
  thinned,
  axisTicks,
  type LiveSeries,
  type ReplaySeries
} from '../features/analysis/model'
import type { LiveChartProps } from '../features/analysis/live-chart'

describe('analysis URL state', () => {
  it('restores tabs, range, pack and replay inputs from a shareable URL', () => {
    const state = analysisState(
      new URLSearchParams(
        'tab=delays&period=7d&pack=crowd&sheet=s&subject=draft&version=v&from=2026-11-01&to=2026-11-04&step=PT5M&project=p'
      )
    )
    expect(state).toEqual({
      tab: 'delays',
      period: '7d',
      pack: 'crowd',
      sheet: 's',
      subject: 'draft',
      version: 'v',
      from: '2026-11-01',
      to: '2026-11-04',
      step: 'PT5M',
      project: 'p'
    })
    expect(analysisQuery(state)).toEqual({ period: '7d', pack: 'crowd' })
  })
  it('uses valid defaults for malformed URL selections', () => {
    expect(analysisState(new URLSearchParams('tab=bad&period=bad&pack=bad&from=nope&step=bad'))).toMatchObject({
      tab: 'sky',
      period: '30d',
      pack: 'sky',
      from: '',
      step: 'reading'
    })
  })
  it('rejects impossible calendar dates in replay URLs', () => {
    expect(analysisState(new URLSearchParams('from=2026-02-31&to=2026-13-01')).from).toBe('')
    expect(analysisState(new URLSearchParams('from=2024-02-29')).from).toBe('2024-02-29')
  })
  it('the Sky and Crowd tabs select their own pack', () => {
    expect(analysisState(new URLSearchParams('tab=crowd&pack=sky')).pack).toBe('crowd')
    expect(analysisState(new URLSearchParams('tab=sky&pack=crowd')).pack).toBe('sky')
  })
})

describe('ANL-5 presentation', () => {
  it('shows no point for n=0 or absent numerators, and never computes Wilson intervals', () => {
    expect(metricValue({ metric: 'precision', x: 0, n: 0, low: null, high: null })).toBeNull()
    expect(metricValue({ metric: 'precision', x: null, n: 8, low: null, high: null })).toBeNull()
    expect(metricValue({ metric: 'precision', x: 7, n: 8, low: 0.53, high: 0.98 })).toBe(0.875)
    expect(metricValue({ metric: 'approval_p50', x: null, value: 12, n: 8, low: null, high: null })).toBe(12)
  })
  it('a long replay is drawn at most 400 points, each the highest count of its run, so peaks survive', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ value: index === 517 ? 9 : 1 }))
    const drawn = thinned(points)
    expect(drawn.size).toBe(3)
    expect(drawn.points.length).toBeLessThanOrEqual(400)
    expect(Math.max(...drawn.points.map((point) => point.value ?? 0))).toBe(9)
    expect(thinned(points.slice(0, 10))).toEqual({ points: points.slice(0, 10), size: 1 })
  })

  it('one axis has 3–5 round ticks and a top tick above the maximum', () => {
    for (const max of [0, 0.99, 1, 12, 2500, 40000]) {
      const ticks = axisTicks(max)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks.length).toBeLessThanOrEqual(5)
      expect(ticks[0]).toBe(0)
      expect(ticks.at(-1)).toBeGreaterThan(max)
    }
  })
  it('ANL-6: a replay series cannot be passed to a live chart', () => {
    expectTypeOf<ReplaySeries>().not.toExtend<LiveChartProps['series']>()
    expectTypeOf<LiveChartProps['series']>().toEqualTypeOf<LiveSeries>()
    expectTypeOf<ReplaySeries['points'][number]>().not.toExtend<LiveSeries['points'][number]>()
    const liveChart = (_series: LiveChartProps['series']) => undefined
    const replay: ReplaySeries = { kind: 'replay', points: [] }
    // @ts-expect-error ANL-6: discriminated series cannot cross the live chart boundary.
    liveChart(replay)
    expect(replay.kind).toBe('replay')
  })
})
