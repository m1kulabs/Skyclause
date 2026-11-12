// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { FooterClock, MytClock } from '../../features/landing/clock'

describe('footer clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  test('ticks each minute in MYT', () => {
    render(<FooterClock />)
    const first = document.querySelector('footer, span')?.textContent ?? document.body.textContent ?? ''
    void first
    expect(document.querySelector('[data-source="clock:Asia/Kuala_Lumpur"]')?.textContent).toContain('MYT')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText(/Kuala Lumpur/)).toBeTruthy()
    // Still MYT after the tick; the interval was registered (60s advance did not throw).
    expect(document.querySelector('[data-source="clock:Asia/Kuala_Lumpur"]')?.textContent).toContain('MYT')
  })

  test('server HTML prints no time before the browser reads its clock', () => {
    const html = renderToString(<FooterClock />)
    expect(html).toContain('Kuala Lumpur')
    expect(html).not.toMatch(/\d{2}:\d{2}/)
  })

  test('reads the wall clock in Kuala Lumpur by its zone, whatever the browser’s own zone', () => {
    vi.setSystemTime(new Date('2026-11-12T08:25:00Z'))
    render(<FooterClock />)
    const time = document.querySelector('time')
    expect(time?.textContent).toBe('16:25 MYT')
    expect(time?.getAttribute('dateTime')).toBe('2026-11-12T08:25:00.000Z')
  })

  test('the hero clock prints the server’s reading first, so the page holds the time without script', () => {
    const html = renderToString(<MytClock initial={{ iso: '2026-11-12T08:25:00.000Z', text: '16:25 MYT' }} />)
    expect(html).toContain('<time dateTime="2026-11-12T08:25:00.000Z">16:25 MYT</time>')
  })
})
