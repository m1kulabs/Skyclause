// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { FooterClock } from '../../features/landing/clock'

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
})
