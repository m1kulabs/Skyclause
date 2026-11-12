import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { READING_ROWS, ReadingsTable } from '../../features/signals/readings-table'
import { latestParts } from '../../features/signals/source-display'
import type { EvaluatedSource, ProjectStrip, SourceReading } from '../../features/signals/operations'

const reading = (index: number, over: Partial<SourceReading> = {}): SourceReading =>
  ({
    id: `reading-${index}`,
    source_id: 'source',
    metric: 'rain_5m_mm',
    unit: 'mm',
    observed_at: new Date(Date.UTC(2026, 10, 5, 0, index * 5)).toISOString(),
    received_at: new Date(Date.UTC(2026, 10, 5, 0, index * 5)).toISOString(),
    value: index / 10,
    value_text: null,
    value_json: null,
    ...over
  }) as SourceReading

test('the readings table starts at twelve rows and never renders more than fifty, newest first', () => {
  const readings = Array.from({ length: 288 }, (_, index) => reading(index))
  const preview = renderToStaticMarkup(<ReadingsTable readings={readings} locale="en" />)
  expect((preview.split('<tbody>')[1]!.match(/<tr /g) ?? []).length).toBe(12)
  expect(preview).toContain('Show the newest 50 readings')
  const html = renderToStaticMarkup(<ReadingsTable readings={readings} locale="en" expanded />)
  expect((html.split('<tbody>')[1]!.match(/<tr /g) ?? []).length).toBe(READING_ROWS)
  expect(html).toContain('The newest 50 of 288 readings, newest first.')
  // reading 287 is the newest
  expect(html.indexOf('28.7')).toBeLessThan(html.indexOf('28.6'))
  expect(html).toContain('text-right')
  expect(html).toContain('data-numeric')
})

test('a short stream says how many readings it holds and prints a missing value as a dash', () => {
  const html = renderToStaticMarkup(
    <ReadingsTable
      readings={[reading(1, { value: null, value_text: 'Thunderstorms Warning', unit: null })]}
      locale="en"
    />
  )
  expect(html).toContain('1 reading.')
  expect(html).toContain('–')
  expect(html).toContain('Thunderstorms Warning')
})

const source = (kind: string, latest: Partial<SourceReading>) =>
  ({ id: 's1', kind, latest_reading: reading(1, latest) }) as unknown as EvaluatedSource
const strip = { inputs: [], series: {} } as unknown as ProjectStrip

test('the newest value splits into its figure and its unit, and a text value has no figure', () => {
  expect(
    latestParts(source('apims', { value: 67, unit: 'API', value_json: { class: 'Moderate' } }), strip, 'en')
  ).toEqual({
    figure: '67',
    rest: 'API · Moderate'
  })
  expect(latestParts(source('met_warning', { value: null, value_text: 'Thunderstorms Warning' }), strip, 'en')).toEqual(
    {
      figure: null,
      rest: 'Thunderstorms Warning'
    }
  )
  expect(
    latestParts({ id: 's2', kind: 'pi', latest_reading: null } as unknown as EvaluatedSource, strip, 'en')
  ).toBeNull()
})
