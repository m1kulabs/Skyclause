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
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '22:00' } })
    expect(fetchMock).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [evaluateUrl, evaluateInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    // The browser reads from the API origin the server handed down, never from the page's own host.
    expect(evaluateUrl).toBe('https://api.example.test/v1/public/commons/bukit-jalil/evaluate')
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

  test('while live verdicts are not open, no control and no minute asks for one; the strip still draws the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <HeroPicker
        initialResult={{ kind: 'unavailable' }}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={<p data-replay />}
      />
    )
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.getAttribute('aria-valuetext')).toMatch(/21:45.*23:15/)
    fireEvent.click(screen.getAllByRole('radio')[2]!)
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('Window end') as HTMLInputElement, { target: { value: '19:00' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Window picker' }))
    await vi.advanceTimersByTimeAsync(130_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(navigator.sendBeacon).not.toHaveBeenCalled()
    // The answer stays the replay, with nothing to retry.
    expect(document.querySelector('[data-replay]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(slider.getAttribute('aria-valuetext')).toMatch(/18:00.*19:00/)
  })

  test('a browser read that answers 501 turns to the replay and stops asking, the minute refresh included', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 501, headers: { get: () => null }, json: () => Promise.resolve({}) })
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
        apiOrigin="https://api.example.test"
        replay={<p data-replay />}
      />
    )
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    await vi.advanceTimersByTimeAsync(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(document.querySelector('[data-replay]')).toBeTruthy())
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    await vi.advanceTimersByTimeAsync(130_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a failed browser read says so without its status code and offers Retry', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 503, headers: { get: () => null }, json: () => Promise.resolve({}) })
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
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByText('Couldn’t reach the live verdict just now.')).toBeTruthy())
    expect(screen.getByText(/^Last tried at \d\d:\d\d MYT\.$/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\b503\b/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
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
        apiOrigin="https://api.example.test"
        replay={null}
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

  test('the strip takes Home, End and Page keys as a slider does', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    const slider = screen.getByRole('slider')
    const lastBody = () => JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    fireEvent.keyDown(slider, { key: 'Home' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ start_time: '00:00', end_time: '01:30' })
    fetchMock.mockClear()
    // Page Up moves an hour later, as a slider's value rises.
    fireEvent.keyDown(slider, { key: 'PageUp' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ start_time: '01:00', end_time: '02:30' })
    fetchMock.mockClear()
    fireEvent.keyDown(slider, { key: 'End' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ start_time: '22:15', end_time: '23:45' })
  })

  test('time fields ask for text, read any common form on blur, and say beside the field when they cannot', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    const start = screen.getByLabelText('Window start') as HTMLInputElement
    const end = screen.getByLabelText('Window end') as HTMLInputElement
    // A phone's number pad has no colon: both fields open the text keyboard.
    expect(start.getAttribute('inputmode')).toBe('text')
    expect(end.getAttribute('inputmode')).toBe('text')
    fireEvent.change(start, { target: { value: '3.30pm' } })
    fireEvent.blur(start)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)).toMatchObject({
      start_time: '15:30',
      end_time: '23:00'
    })
    expect(start.value).toBe('15:30')
    expect(start.getAttribute('aria-invalid')).toBeNull()
    fetchMock.mockClear()
    fireEvent.change(end, { target: { value: 'soon' } })
    fireEvent.blur(end)
    expect(end.getAttribute('aria-invalid')).toBe('true')
    const message = document.getElementById(end.getAttribute('aria-describedby')!.split(' ').at(-1)!)
    expect(message?.textContent).toMatch(/quarter hour/)
    // The unreadable text stays for the visitor to correct; nothing is sent for it.
    expect(end.value).toBe('soon')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(end, { target: { value: '1800' } })
    fireEvent.blur(end)
    expect(end.getAttribute('aria-invalid')).toBeNull()
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
        apiOrigin="https://api.example.test"
        replay={null}
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
        apiOrigin="https://api.example.test"
        replay={null}
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
    slider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 900, buttons: 1 }))
    slider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 900 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const dragBody = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(dragBody).toMatchObject({ start_time: '10:00', end_time: '15:00' })
  })

  test('a reverse drag selects back to the press point, and a release off the strip ends the drag', async () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
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
    slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 600 }))
    slider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 540, buttons: 1 }))
    document.body.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 540 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string)
    expect(body).toMatchObject({ start_time: '09:00', end_time: '10:00' })
    // The release landed off the strip; a later hover with no button down must not move the window.
    slider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 900 }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The strip at a phone's width: 318px for 24 hours, so an hour's span is 13px and its capsule is drawn at 28px.
  const phoneTrack = { left: 0, width: 318, top: 0, height: 40, right: 318, bottom: 40, x: 0, y: 0, toJSON: () => {} }
  /** 06:00 to 07:00: the capsule's drawn centre, 14px past its start, lies beyond the hour's span. */
  const capsuleCentre = (360 / 1440) * 318 + 14
  // jsdom has no PointerEvent constructor, so MouseEvents carry the pointer type the picker reads.
  const pointer = (type: string, pointerType: string, init: MouseEventInit) => {
    const event = new MouseEvent(type, { bubbles: true, ...init })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    return event
  }
  const renderAtSix = () => {
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 360, endMin: 420 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    const slider = screen.getByRole('slider')
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(phoneTrack as DOMRect)
    fetchMock.mockClear()
    return slider
  }

  test('under touch, nothing changes until the press moves 8px sideways', async () => {
    const slider = renderAtSix()
    // A scroll that starts at 18:00, outside the window: the thumb travels up and barely sideways, then the browser
    // takes the scroll and cancels the pointer.
    slider.dispatchEvent(pointer('pointerdown', 'touch', { clientX: 238, clientY: 20 }))
    slider.dispatchEvent(pointer('pointermove', 'touch', { clientX: 241, clientY: -60, buttons: 1 }))
    slider.dispatchEvent(pointer('pointercancel', 'touch', { clientX: 241, clientY: -60 }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(slider.getAttribute('aria-valuenow')).toBe('360')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('a cancelled touch drag puts back the window held at the press', async () => {
    const slider = renderAtSix()
    slider.dispatchEvent(pointer('pointerdown', 'touch', { clientX: capsuleCentre }))
    slider.dispatchEvent(pointer('pointermove', 'touch', { clientX: capsuleCentre - 50, buttons: 1 }))
    await waitFor(() => expect(slider.getAttribute('aria-valuenow')).not.toBe('360'))
    slider.dispatchEvent(pointer('pointercancel', 'touch', { clientX: capsuleCentre - 50 }))
    await waitFor(() => expect(slider.getAttribute('aria-valuenow')).toBe('360'))
    expect(slider.getAttribute('aria-valuetext')).toMatch(/06:00.*07:00/)
  })

  test('a press on the capsule as drawn moves the window, by mouse and by a replayed first press', async () => {
    const slider = renderAtSix()
    slider.dispatchEvent(pointer('pointerdown', 'mouse', { clientX: capsuleCentre }))
    slider.dispatchEvent(pointer('pointermove', 'mouse', { clientX: capsuleCentre + 80, buttons: 1 }))
    slider.dispatchEvent(pointer('pointerup', 'mouse', { clientX: capsuleCentre + 80 }))
    await waitFor(() => expect(slider.getAttribute('aria-valuenow')).not.toBe('360'))
    const length = (text: string) => {
      const [start, end] = text
        .match(/\d\d:\d\d/g)!
        .map((time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)))
      return end! - start!
    }
    expect(length(slider.getAttribute('aria-valuetext')!)).toBe(60)
    cleanup()

    // The island's first press arrives as a replay, before its own handlers exist.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(phoneTrack as DOMRect)
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 360, endMin: 420 }}
        dates={dates}
        latestCall={null}
        pilot={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        initialReplay={{ k: 'ptr', x: capsuleCentre }}
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    const replayed = screen.getByRole('slider')
    replayed.dispatchEvent(pointer('pointermove', 'touch', { clientX: capsuleCentre + 80, buttons: 1 }))
    await waitFor(() => expect(replayed.getAttribute('aria-valuenow')).not.toBe('360'))
    expect(length(replayed.getAttribute('aria-valuetext')!)).toBe(60)
  })

  test('a stale calendar read neither restores its window to the URL nor beacons it', async () => {
    let releaseFirst: (() => void) | undefined
    let calendarCalls = 0
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('evaluate')) return Promise.resolve(evaluateOk())
      calendarCalls += 1
      if (calendarCalls === 1)
        return new Promise((resolve) => {
          releaseFirst = () => resolve(okResponse())
        })
      return Promise.resolve(okResponse())
    })
    window.history.replaceState(null, '', '/')
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={{ org: 'x', project: 'y' }}
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    const start = screen.getByLabelText('Window start') as HTMLInputElement
    fireEvent.change(start, { target: { value: '22:00' } })
    await waitFor(() => expect(releaseFirst).toBeDefined())
    fireEvent.change(start, { target: { value: '21:00' } })
    await waitFor(() => expect(window.location.search).toContain('start=21%3A00'))
    releaseFirst!()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.location.search).toContain('start=21%3A00')
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1)
  })

  test('a failed calendar read shows the error, never n=0', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('evaluate')
          ? evaluateOk()
          : { ok: false, status: 503, headers: { get: () => null }, json: () => Promise.resolve({}) }
      )
    )
    render(
      <HeroPicker
        initialResult={initialResult}
        initialStripSvg={null}
        initialWin={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        dates={dates}
        latestCall={null}
        pilot={{ org: 'x', project: 'y' }}
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '22:00' } })
    await waitFor(() => expect(screen.getByText('Couldn’t reach the approved-call calendar.')).toBeTruthy())
    expect(screen.queryByText(/No approved call yet/)).toBeNull()
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
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    fireEvent.change(screen.getByLabelText('Window start') as HTMLInputElement, { target: { value: '22:00' } })
    await waitFor(() => expect(screen.getByText(/^Try again after \d\d:\d\d MYT\.$/)).toBeTruthy())
    expect(screen.getByText('Live verdicts are busy just now.')).toBeTruthy()
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
        apiOrigin="https://api.example.test"
        replay={null}
      />
    )
    expect(second.container.querySelector('[data-rain-animated="no"]')).toBeTruthy()
  })
})
