// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../../features/landing-hero/catalogue'
import { HeroActivator } from '../../features/landing-hero/activator'
import { HeroStatic } from '../../features/landing-hero/hero-static'
import type { EvaluateResult } from '../../features/landing-hero/evaluate'

// The picker island loads on first intent; until then the server's static band and form are the page.
vi.mock('../../features/landing-hero/hero-picker', () => ({ default: () => <p data-picker /> }))

const result: EvaluateResult = { kind: 'error', status: 501, at: '2026-11-05T13:05:00.000Z' }
const win = { date: '2026-11-05', startMin: 1290, endMin: 1380 }
const dates = ['2026-11-05', '2026-11-06']

function renderActivator() {
  return render(
    <HeroActivator
      initialResult={result}
      initialStripSvg={null}
      initialWin={win}
      dates={dates}
      latestCall={null}
      pilot={null}
      calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
    >
      <HeroStatic
        result={result}
        stripSvg={null}
        win={win}
        dates={dates}
        latestCall={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        now="2026-11-05T08:00:00.000Z"
      />
    </HeroActivator>
  )
}

describe('HeroActivator', () => {
  afterEach(cleanup)

  test('arrow keys in a time field or on a date radio stay there; only the strip wakes the picker with a key', async () => {
    renderActivator()
    const start = screen.getByLabelText('Window start')
    // Moving the caret in a field, or arrowing through the dates, is the field's own business.
    fireEvent.keyDown(start, { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getAllByRole('radio')[0]!, { key: 'ArrowRight' })
    expect(screen.getByLabelText('Window start')).toBe(start)
    expect(document.querySelector('[data-picker]')).toBeNull()
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    await waitFor(() => expect(document.querySelector('[data-picker]')).toBeTruthy())
  })
})
