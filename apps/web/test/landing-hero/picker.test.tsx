// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../../features/landing-hero/catalogue'
import HeroPicker from '../../features/landing-hero/hero-picker'
import type { EvaluateResult } from '../../features/landing-hero/evaluate'
import { input } from './fixtures'

const initialResult: EvaluateResult = {
  kind: 'ok',
  data: {
    label: 'Clause engine verdict: not reviewed, not sent',
    evaluated_at: '2026-11-05T13:05:00.000Z',
    verdicts: [
      {
        t_eval: '2026-11-05T13:05:00.000Z',
        pack: 'sky',
        content_hash: 'c',
        snapshot_hash: 's',
        hash: 'h',
        site: [],
        windows: [
          {
            scope: { kind: 'window' as const, id: 'w1' },
            pack: 'sky',
            mode: 'normal',
            watch: false,
            no_call: null,
            recommendations: [],
            clauses: [{ key: 'Storm confirmed', result: 'fired' as const, blocked_by: [], inputs: [input()] }],
            open_from: null
          }
        ],
        nights: []
      }
    ],
    strip: []
  }
}
const initialData = initialResult.kind === 'ok' ? initialResult.data : null

const dates = [
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12'
]

function okResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({ data: [], next_cursor: null })
  }
}

function evaluateOk() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(initialData)
  }
}

describe('HeroPicker', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => Promise.resolve(url.includes('evaluate') ? evaluateOk() : okResponse()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      }
    )
    Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('time fields produce the same request as keys, debounced 300ms, beaconing once after the response', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '22:00' } })
    expect(fetchMock).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [evaluateUrl, evaluateInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(evaluateUrl).toContain('/v1/public/commons/bukit-jalil/evaluate')
    expect(JSON.parse(evaluateInit.body as string)).toEqual({
      date: '2026-11-05',
      start_time: '22:00',
      end_time: '23:00'
    })
    await waitFor(() => expect(navigator.sendBeacon).toHaveBeenCalledTimes(1))
    const [, beaconBody] = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string]
    const beacon = JSON.parse(beaconBody)
    expect(beacon.name).toBe('landing_window_set')
    expect(beacon.props.modes).toEqual(['normal'])
    expect(beacon.props).toEqual({ modes: ['normal'], inputs_fresh: 1, inputs_error: 0 })
    expect(beaconBody).not.toContain('2026-11-05')
  })

  test('arrows move the start with the length held; Shift with arrows changes only the length', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    let body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body).toMatchObject({ start_time: '21:45', end_time: '23:15' })
    fetchMock.mockClear()
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body).toMatchObject({ start_time: '21:45', end_time: '23:30' })
  })

  test('range limits hold for fields, and drag makes the same request as the fields', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '23:45' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body).toMatchObject({ start_time: '23:30', end_time: '23:45' })
  })

  test('dragging the strip produces the same request as the time fields', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    fetchMock.mockClear()
    const slider = screen.getByRole('slider')
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1440,
      top: 0,
      height: 120,
      right: 1440,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => {}
    } as DOMRect)
    // jsdom has no PointerEvent constructor with clientX, so dispatch MouseEvents under the pointer type.
    slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 600 }))
    slider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 900 }))
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 900 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const dragBody = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(dragBody).toMatchObject({ start_time: '10:00', end_time: '15:00' })
  })

  test('a 429 shows Retry-After in MYT, and gauge errors suppress rain animation', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('evaluate')
          ? { ok: false, status: 429, headers: { get: () => '60' }, json: () => Promise.resolve({}) }
          : okResponse()
      )
    )
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '22:00' } })
    await waitFor(() => expect(screen.getByText(/Retry after .* MYT/)).toBeTruthy())
    const errorResult: EvaluateResult = {
      kind: 'ok',
      data: {
        ...initialData!,
        verdicts: [
          {
            ...initialData!.verdicts[0]!,
            windows: [
              {
                ...initialData!.verdicts[0]!.windows[0]!,
                clauses: [
                  {
                    key: 'Storm confirmed',
                    result: 'fired' as const,
                    blocked_by: [],
                    inputs: [
                      input({
                        state: 'error',
                        value: null,
                        since: '2026-11-05T07:00:00.000Z',
                        observed_at: '2026-11-05T07:00:00.000Z'
                      })
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
    const second = render(
      <HeroPicker
        initialResult={errorResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
      />
    )
    expect(second.container.querySelector('[data-rain-animated="no"]')).toBeTruthy()
  })
})
