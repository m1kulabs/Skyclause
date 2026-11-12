import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { MetricFigure } from '../features/analysis/presentation'
import { LiveChart, PointsTable } from '../features/analysis/live-chart'
import { allPages, type Metric } from '../features/analysis/operations'
import { catalogueFor, messageAt } from '../../../packages/i18n/src/catalogue'
import en from '../../../packages/i18n/catalogue/en/analysis.json'

const figure: Metric = { metric: 'precision', pack: 'sky', clause_key: null, x: 7, n: 8, low: 0.53, high: 0.98 }
const dates = { from: '2026-11-01', to: '2026-11-04', locale: 'en' as const }

describe('ANL-5 rendered figures', () => {
  it('renders the server Wilson interval, 2px tick, numerator, denominator and period', () => {
    const html = renderToStaticMarkup(createElement(MetricFigure, { metric: figure, ...dates, source: 'test-capture' }))
    for (const text of ['Wilson 95% interval 53% to 98%', 'stroke-width="2"', '7 of 8', 'n=8', '2026', 'test-capture'])
      expect(html).toContain(text)
  })
  it('n=0 omits even a supplied interval and explains the next action', () => {
    const html = renderToStaticMarkup(
      createElement(MetricFigure, { metric: { ...figure, n: 0 }, ...dates, source: 'test-capture' })
    )
    expect(html).toContain('n=0')
    expect(html).toContain('Wait for nightly grading')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('Wilson')
  })
  it('n=0 suppresses a live chart even when a series contains populated rows', () => {
    const html = renderToStaticMarkup(
      createElement(LiveChart, {
        ...dates,
        n: 0,
        metric: 'precision',
        series: { kind: 'live', points: [{ kind: 'live', at: '2026-11-04T00:00:00Z', value: 0.875, metric: figure }] }
      })
    )
    expect(html).toContain('n=0')
    expect(html).not.toContain('data-slot="chart"')
    expect(html).toContain('Wait for nightly grading')
  })
  it('keeps the Wilson interval beside a rate in the live chart table, and renders the rows only when it shows', () => {
    const points = [{ kind: 'live' as const, at: '2026-11-04T00:00:00Z', value: 0.875, metric: figure }]
    const chart = renderToStaticMarkup(
      createElement(LiveChart, { ...dates, n: 8, metric: 'precision', series: { kind: 'live', points } })
    )
    expect(chart).not.toContain('data-origin="live"')
    const table = renderToStaticMarkup(createElement(PointsTable, { points, label: 'Precision', locale: 'en' }))
    expect(table).toContain('Wilson 95% interval 53% to 98%')
    expect(table).toContain('data-slot="table"')
  })

  it('a table of more than 50 days pages them', () => {
    const points = Array.from({ length: 51 }, (_, index) => ({
      kind: 'live' as const,
      at: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
      value: 0.875,
      metric: figure
    }))
    const table = renderToStaticMarkup(createElement(PointsTable, { points, label: 'Precision', locale: 'en' }))
    expect(table.match(/data-origin="live"/g)).toHaveLength(50)
    expect(table).toContain('Rows 1–50 of 51')
  })
})

describe('analysis reads and copy', () => {
  it('collects later pages so review and graded windows are never silently truncated', async () => {
    expect(
      await allPages(async (cursor) =>
        cursor ? { data: ['second'], next_cursor: null } : { data: ['first'], next_cursor: 'next' }
      )
    ).toEqual(['first', 'second'])
  })
  it('rejects repeated cursors and propagates API failures', async () => {
    await expect(allPages(async () => ({ data: [], next_cursor: 'same' }))).rejects.toThrow('Repeated analysis cursor')
    await expect(
      allPages(async () => {
        throw new Error('unavailable')
      })
    ).rejects.toThrow('unavailable')
  })
  it('has real Malay copy for every analysis key', () => {
    function keys(value: object, prefix: string[] = []): string[][] {
      return Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'string' ? [[...prefix, key]] : keys(child, [...prefix, key])
      )
    }
    for (const key of keys(en)) expect(messageAt(catalogueFor('ms', 'analysis'), key), key.join('.')).toBeTruthy()
    expect(messageAt(catalogueFor('ms', 'analysis'), ['reviewTitle'])).toBe(
      'Item semakan dan tetingkap tanpa keputusan'
    )
  })
})
