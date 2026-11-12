import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { formatDateTime } from '@skyclause/i18n/format'
import { t } from '../../features/signals/catalogue'
import type { EvaluatedSource, Project, ProjectStrip, SourceReading } from '../../features/signals/operations'
import { newestObservedAt, SourceDetail } from '../../features/signals/source-detail'

const reading = (observed_at: string, value = 0): SourceReading =>
  ({
    id: `reading-${observed_at}`,
    source_id: 'source-rain',
    metric: 'rain_5m_mm',
    unit: 'mm',
    observed_at,
    received_at: observed_at,
    value,
    value_text: null,
    value_json: null
  }) as SourceReading

afterEach(() => {
  vi.useRealTimers()
})

test('newestObservedAt picks the greatest observed_at regardless of order', () => {
  const oldest = '2026-11-11T21:50:00.000Z'
  const middle = '2026-11-12T10:00:00.000Z'
  const newest = '2026-11-12T21:15:00.000Z'

  expect(newestObservedAt([reading(newest), reading(middle), reading(oldest)])).toBe(newest)
  expect(newestObservedAt([reading(oldest), reading(middle), reading(newest)])).toBe(newest)
  expect(newestObservedAt([reading(middle), reading(newest), reading(oldest)])).toBe(newest)
  expect(newestObservedAt([])).toBeNull()
})

test('SourceDetail header uses the newest reading when readings arrive newest first', () => {
  const now = new Date('2026-11-12T21:30:00.000Z')
  vi.useFakeTimers()
  vi.setSystemTime(now)

  const newest = '2026-11-12T21:15:00.000Z'
  const oldest = '2026-11-11T21:50:00.000Z'

  const project = {
    id: 'project-1',
    slug: 'bukit-jalil',
    name: 'Bukit Jalil',
    time_zone: 'Asia/Kuala_Lumpur'
  } as unknown as Project

  const source = {
    id: 'source-rain',
    external_id: '0232901RF',
    kind: 'jps_rain',
    state: { state: 'fresh', since: oldest },
    age_s: 900,
    latest_reading: reading(newest)
  } as unknown as EvaluatedSource

  const strip = { inputs: [], series: {} } as unknown as ProjectStrip

  const html = renderToStaticMarkup(
    <SourceDetail
      project={project}
      source={source}
      strip={strip}
      readings={[reading(newest, 0.5), reading(oldest, 0)]}
      polls={[]}
      locale="en"
      onClose={() => {}}
    />
  )

  expect(html).toContain(t('signals.source_time_value', { time: formatDateTime(newest, 'en') }, 'en'))
  expect(html).not.toContain(t('signals.source_time_value', { time: formatDateTime(oldest, 'en') }, 'en'))
})
