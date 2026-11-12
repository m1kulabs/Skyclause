import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { formatDate } from '../../../../packages/i18n/src/format'
import { wilson } from '../../features/probation/model'
import { t } from '../../features/probation/i18n'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement('a', { href }, children)
}))

// ProgressView is imported after the Link mock so the static markup never needs the app router.
const { ProgressView } = await import('../../features/probation/progress-view')

const base = {
  org: 'test-org',
  project: 'bukit-jalil',
  sourceId: 'camera-1',
  disagreements: 0,
  locale: 'en' as const,
  onStatus: () => {}
}

function status(overrides = {}) {
  return {
    source_id: 'camera-1',
    probation: true,
    labeller_ids: ['account-labeller-one', 'account-labeller-two'],
    n: 96,
    obscured_frames: 9,
    agreement: 0.93,
    ...overrides
  }
}

describe('probation progress view', () => {
  test('on probation prints agreement with its Wilson interval, n and obscured against their targets, never a chart', () => {
    const interval = wilson(Math.round(0.93 * 96), 96)!
    const html = renderToStaticMarkup(
      createElement(ProgressView, { ...base, status: status(), passedAt: null, picker: 'none' })
    )
    expect(html).toContain('0.93')
    expect(html).toContain(t('probation.measure_needed', { needed: '0.90' }, 'en'))
    expect(html).toContain(
      t('probation.progress_interval', { n: '96', low: String(interval.lo), high: String(interval.hi) }, 'en')
    )
    expect(html).toContain('data-probation-frames="96"')
    expect(html).toContain(t('probation.measure_of', { value: '96', target: '100' }, 'en'))
    expect(html).toContain('data-probation-obscured="9"')
    expect(html).toContain(t('probation.measure_of', { value: '9', target: '10' }, 'en'))
    expect(html).toContain('data-probation-disagreements="0"')
    expect(html).toContain(t('probation.verdict_watching', {}, 'en'))
    expect(html).not.toContain('<canvas')
    expect(html).not.toContain('role="img"')
    expect(html).not.toContain('<figure')
    expect(html).not.toContain('phone_obscured')
  })

  test('passed probation prints the verdict date with the interval', () => {
    const passedAt = '2026-11-06T01:00:00Z'
    const html = renderToStaticMarkup(
      createElement(ProgressView, {
        ...base,
        status: status({ probation: false, n: 104, obscured_frames: 12, agreement: 0.95 }),
        passedAt,
        picker: 'none'
      })
    )
    expect(html).toContain(t('probation.verdict_passed', { date: formatDate(passedAt, 'en') }, 'en'))
    expect(html).toContain('95%')
    expect(html).not.toContain(t('probation.verdict_watching', {}, 'en'))
    expect(html).not.toContain('role="img"')
  })

  test('no status prints n=0 with no interval and a next action', () => {
    const html = renderToStaticMarkup(
      createElement(ProgressView, { ...base, status: null, passedAt: null, picker: 'none' })
    )
    expect(html).toContain(t('probation.progress_zero', {}, 'en'))
    expect(html).not.toContain('95%')
    expect(html).not.toContain('data-probation-frames')
    expect(html).toContain(t('probation.progress_cta', {}, 'en'))
  })

  test('a viewer sees no labeller picker', () => {
    const html = renderToStaticMarkup(
      createElement(ProgressView, { ...base, status: status(), passedAt: null, picker: 'none' })
    )
    expect(html).not.toContain(t('probation.picker_heading', {}, 'en'))
  })
})
