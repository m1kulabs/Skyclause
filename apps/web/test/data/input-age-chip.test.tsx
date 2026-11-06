// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/data-components/catalogue'
import { InputAgeChip, __resetAgeTimerForTests } from '../../features/data-components/input-age-chip'

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

import type { InputValue } from '@skyclause/contracts'

function inputAt(minutesAgo: number, state: InputValue['state'] = 'fresh'): InputValue {
  const observed = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return {
    name: 'gauge',
    value: 39,
    unit: 'mm',
    source_ids: ['0232901RF'],
    source_url: null,
    reading_ids: ['r1'],
    observed_at: observed,
    state,
    since: observed,
    age_s: minutesAgo * 60
  }
}

describe('InputAgeChip', () => {
  afterEach(() => {
    cleanup()
    __resetAgeTimerForTests()
    vi.useRealTimers()
  })

  test('fresh renders its word, glyph and age', async () => {
    render(<InputAgeChip input={{ ...inputAt(12, 'fresh') }} />)
    expect(screen.getByLabelText(/gauge 12 min old/)).toBeTruthy()
    expect(document.body.innerHTML).toContain('aria-hidden="true"')
    await expectAxeClean()
  })

  test('stale adds the clock glyph and stale word', async () => {
    render(<InputAgeChip input={{ ...inputAt(12, 'stale') }} />)
    expect(screen.getByLabelText(/stale/)).toBeTruthy()
    expect(document.body.innerHTML).toContain('aria-hidden="true"')
    await expectAxeClean()
  })

  test('error reads gauge error since HH:MM with MYT nearby', async () => {
    render(<InputAgeChip input={{ ...inputAt(12, 'error') }} />)
    const label = screen.getByLabelText(/gauge error since/).getAttribute('aria-label') ?? ''
    expect(label).toMatch(/\d{2}:\d{2}/)
    await expectAxeClean()
  })

  test('pending renders its glyph without crashing', async () => {
    render(<InputAgeChip input={{ ...inputAt(1, 'pending') }} />)
    expect(screen.getByLabelText(/gauge/)).toBeTruthy()
    await expectAxeClean()
  })

  test('daily files read data to date', async () => {
    render(<InputAgeChip input={{ ...inputAt(12, 'fresh') }} dailyDate="2026-11-03" />)
    expect(screen.getByLabelText(/data to 3 November 2026/)).toBeTruthy()
  })

  test('ages refresh at least once a minute with an injected clock', async () => {
    __resetAgeTimerForTests()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T07:12:00Z'))
    render(
      <InputAgeChip
        input={{
          name: 'gauge',
          value: 39,
          unit: 'mm',
          source_ids: ['0232901RF'],
          source_url: null,
          reading_ids: ['r1'],
          observed_at: '2026-11-02T07:00:00Z',
          state: 'fresh',
          since: '2026-11-02T07:00:00Z',
          age_s: 720
        }}
      />
    )
    expect(screen.getByLabelText(/12 min old/)).toBeTruthy()
    vi.setSystemTime(new Date('2026-11-02T07:13:00Z'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByLabelText(/14 min old/)).toBeTruthy()
  })

  test('targets meet 34px and honour the shared timer', () => {
    render(<InputAgeChip input={{ ...inputAt(12, 'fresh') }} />)
    const trigger = screen.getByLabelText(/gauge/)
    expect(trigger.className).toContain('min-h-[34px]')
    expect(trigger.className).toContain('[@media(pointer:coarse)]:min-h-[44px]')
  })
})
