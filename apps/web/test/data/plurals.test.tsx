// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import '../../features/data-components/catalogue'
import { WindowStrip } from '../../features/data-components/window-strip'

afterEach(cleanup)

const one = {
  from: '2026-11-02T06:00:00Z',
  to: '2026-11-02T08:00:00Z',
  now: '2026-11-02T08:05:00Z',
  window: null,
  rain5: [{ at: '2026-11-02T07:00:00Z', value: 0.5, state: 'received' as const }],
  rain60: [],
  warnings: [],
  crowdPeriods: [],
  ages: [],
  replay: null
}

test('a strip with one reading says "1 reading", never "1 readings"', () => {
  for (const locale of ['en', 'ms'] as const) {
    render(<WindowStrip windows={[]} strip={one} locale={locale} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b1 readings\b/)
    if (locale === 'en') expect(text).toContain('1 reading.')
    cleanup()
  }
})
