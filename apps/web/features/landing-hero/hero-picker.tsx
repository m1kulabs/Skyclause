'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from './catalogue'
import { fetchEvaluate, fetchLatestCall, type EvaluateResult, type LatestCallRead } from './evaluate'
import type { PickerReplay } from './activator'
import { HeroReadout } from './readout'
import { HeroStrip } from './hero-strip'
import { HeroBand } from './hero-band'
import {
  CLOCK_SOURCE,
  beaconEventOf,
  clampWindow,
  groupedVerdicts,
  hasGaugeError,
  onCapsule,
  parseLocalTime,
  parseTimeInput,
  skyStateOf,
  snapToStep,
  stripKeyWindow,
  stripOf,
  TIME_INPUT_PATTERN,
  toLocalTime,
  type HeroWindow
} from './window-model'
import { formatDateCompact } from '@skyclause/i18n/format'
import styles from './hero.module.css'

export interface HeroPickerProps {
  initialResult: EvaluateResult
  initialStripSvg: string | null
  initialWin: HeroWindow
  dates: string[]
  latestCall: LatestCallRead
  pilot: { org: string; project: string } | null
  calendarQuery: string
  /** The server's API_ORIGIN: the browser reads the verdict there, never from the marketing host. */
  apiOrigin: string | undefined
  /** The labelled replay, drawn on the server: the answer while live verdicts are not open. */
  replay: ReactNode
  initialReplay?: PickerReplay | null
}

function beaconEndpoint(): string {
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  const [first, ...rest] = hostname.split('.')
  return (first === 'app' || first === 'embed') && rest.length > 1
    ? `${window.location.protocol}//${rest.join('.')}/e`
    : '/e'
}

/** The window in the page's URL, as the no-JS form's GET writes it, so a reload or a shared link opens it again. */
function keepWindowInUrl(win: HeroWindow) {
  const params = new URLSearchParams({ date: win.date, start: toLocalTime(win.startMin), end: toLocalTime(win.endMin) })
  window.history.replaceState(null, '', `/?${params.toString()}`)
}

/** Sideways travel before a touch or pen press moves the window: a scroll that starts on the strip stays a scroll. */
const DRAG_THRESHOLD_PX = 8

interface Drag {
  mode: 'move' | 'create'
  offset: number
  start: number
  end: number
  /** Where the press landed and the travel it needs before it changes anything. */
  x: number
  threshold: number
  moved: boolean
  /** The window at the press, which a cancelled gesture puts back. */
  from: { startMin: number; endMin: number }
}

export default function HeroPicker({
  initialResult,
  initialStripSvg,
  initialWin,
  dates,
  latestCall,
  pilot,
  calendarQuery,
  apiOrigin,
  replay,
  initialReplay
}: HeroPickerProps) {
  const [win, setWin] = useState(initialWin)
  const [result, setResult] = useState(initialResult)
  const [latest, setLatest] = useState(latestCall)
  const [startText, setStartText] = useState(toLocalTime(initialWin.startMin))
  const [endText, setEndText] = useState(toLocalTime(initialWin.endMin))
  const [pending, setPending] = useState(false)
  // A typed time the parser cannot read stays in its field, marked, with the rule beside it.
  const [invalid, setInvalid] = useState<{ start: boolean; end: boolean }>({ start: false, end: false })
  const timeErrorId = useId()
  const rootRef = useRef<HTMLFormElement>(null)
  const firstWindowRef = useRef(true)
  const visibleRef = useRef(true)
  const dragRef = useRef<Drag | null>(null)
  const beaconedRef = useRef(`${initialWin.date}|${initialWin.startMin}|${initialWin.endMin}`)
  const requestRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winRef = useRef(win)
  winRef.current = win
  const sliderRef = useRef<HTMLDivElement>(null)
  const replayDoneRef = useRef(false)
  const firstSyncRef = useRef(false)
  const answerRef = useRef<HTMLDivElement>(null)
  const tallestRef = useRef(0)

  // The first intent that mounted this island is replayed once, so the click or key is not lost.
  useEffect(() => {
    if (replayDoneRef.current || !initialReplay) return
    replayDoneRef.current = true
    const replay: PickerReplay = initialReplay
    // The server's controls were replaced by this island's: focus returns to the one the visitor was using.
    const refocus = (selector: string) => rootRef.current?.ownerDocument.querySelector<HTMLElement>(selector)?.focus()
    if (replay.k === 'fld' && replay.n && replay.v) {
      if (replay.n === 'date' && dates.includes(replay.v)) {
        setWin((current) => ({ ...current, date: replay.v! }))
        refocus(`#window input[name="date"][value="${replay.v}"]`)
      } else if (replay.n === 'start' || replay.n === 'end') {
        // The typed text carries over whole; a complete time also moves the window.
        if (replay.n === 'start') setStartText(replay.v)
        else setEndText(replay.v)
        const parsed = parseLocalTime(replay.v)
        if (parsed !== null) {
          if (replay.n === 'start') commitTimes(parsed, winRef.current.endMin)
          else commitTimes(winRef.current.startMin, parsed)
        }
        refocus(`#window input[name="${replay.n}"]`)
      }
    } else if (replay.k === 'key' && replay.key) {
      const next = stripKeyWindow(replay.key, !!replay.shift, winRef.current)
      if (next) commitTimes(next.start, next.end)
      sliderRef.current?.focus()
    } else if (replay.k === 'ptr' && typeof replay.x === 'number' && sliderRef.current) {
      // The replay doesn't say which pointer pressed, so the press waits for sideways travel as a touch's does.
      dragRef.current = press(replay.x, sliderRef.current, DRAG_THRESHOLD_PX)
    }
  }, [])

  // While live verdicts are not open (the server's read answered 501), no window can be read: the picker draws the
  // chosen window on the strip, keeps it in the URL, keeps the replay as the answer, and asks the API nothing until the
  // next page load.
  const open = result.kind !== 'unavailable'
  // After a 429 the picker asks nothing until the time the API gave (a minute when it gave none): the minute's refresh
  // and window changes wait, and when the time comes the window then shown is read once.
  const pausedUntil = result.kind === 'rate_limited' ? Date.parse(result.retryAfter) : null
  const pausedUntilRef = useRef(pausedUntil)
  pausedUntilRef.current = pausedUntil
  const heldRef = useRef(false)
  const paused = () => pausedUntilRef.current !== null && Date.now() < pausedUntilRef.current

  const evaluate = useCallback(
    async (next: HeroWindow, beacon: boolean, silent = false) => {
      const id = ++requestRef.current
      // The minute's refresh reads quietly: only a read the visitor asked for dims the answer on screen.
      if (!silent) setPending(true)
      const outcome = await fetchEvaluate(next, apiOrigin)
      if (id !== requestRef.current) return
      setPending(false)
      setResult(outcome)
      if (outcome.kind === 'ok') {
        const fetchedLatest = await fetchLatestCall(pilot, apiOrigin)
        // A newer request owns the readout, the beacon and the URL from here.
        if (id !== requestRef.current) return
        setLatest(fetchedLatest)
        const key = `${next.date}|${next.startMin}|${next.endMin}`
        if (beacon && beaconedRef.current !== key) {
          beaconedRef.current = key
          const grouped = groupedVerdicts(outcome.data.verdicts)
          try {
            navigator.sendBeacon(beaconEndpoint(), JSON.stringify(beaconEventOf(grouped)))
          } catch {
            // Beacons are best-effort; the verdict already rendered.
          }
        }
        keepWindowInUrl(next)
      }
    },
    [pilot, apiOrigin]
  )

  useEffect(() => {
    if (firstWindowRef.current) {
      firstWindowRef.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) {
      // The URL settles with the window, as a read would; a drag writes it once, not on every step.
      debounceRef.current = setTimeout(() => keepWindowInUrl(win), 300)
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }
    if (paused()) {
      heldRef.current = true
      return
    }
    debounceRef.current = setTimeout(() => void evaluate(win, true), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [evaluate, win, open])

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      if (paused()) return
      if (visibleRef.current && document.visibilityState !== 'hidden') void evaluate(winRef.current, false, true)
    }, 60_000)
    return () => clearInterval(timer)
  }, [evaluate, open])

  useEffect(() => {
    if (pausedUntil === null) return
    const timer = setTimeout(
      () => {
        // A window chosen during the pause is the visitor's read; otherwise the shown one is refreshed quietly.
        const held = heldRef.current
        heldRef.current = false
        void evaluate(winRef.current, held, !held)
      },
      Math.max(0, pausedUntil - Date.now())
    )
    return () => clearTimeout(timer)
  }, [evaluate, pausedUntil])

  // The answer's slot (the readings strip and the readout) keeps the tallest answer it has shown, and CSS reserves the
  // replay's height before any, so a shorter verdict, a failure or a rate limit never pulls the panel up and the
  // photograph above it down. A new width starts over.
  useLayoutEffect(() => {
    const slot = answerRef.current
    if (!slot) return
    const height = slot.getBoundingClientRect().height
    if (height > tallestRef.current) {
      tallestRef.current = height
      slot.style.minHeight = `${height}px`
    }
  }, [result, latest])

  useEffect(() => {
    const reset = () => {
      tallestRef.current = 0
      answerRef.current?.style.removeProperty('min-height')
    }
    window.addEventListener('resize', reset)
    return () => window.removeEventListener('resize', reset)
  }, [])

  useEffect(() => {
    if (!rootRef.current) return
    const observer = new IntersectionObserver((entries) => {
      visibleRef.current = entries[0]?.isIntersecting ?? true
    })
    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (replayDoneRef.current && initialReplay?.k === 'fld' && !firstSyncRef.current) {
      // The replayed keystroke's text stays until the visitor leaves the field.
      firstSyncRef.current = true
      return
    }
    firstSyncRef.current = true
    setStartText(toLocalTime(win.startMin))
    setEndText(toLocalTime(win.endMin))
  }, [win.startMin, win.endMin])

  const commitTimes = (start: number, end: number) => {
    const clamped = clampWindow(start, end)
    setWin((current) => ({ ...current, startMin: clamped.start, endMin: clamped.end }))
  }

  const minutesAt = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    if (!Number.isFinite(clientX) || !(rect.width > 0)) return null
    return snapToStep(Math.round(((clientX - rect.left) / rect.width) * 1440))
  }

  /** A press on the strip: on the capsule as drawn it moves the window; elsewhere it anchors a new one at the press. */
  const press = (clientX: number, target: HTMLElement, threshold: number): Drag | null => {
    const minutes = minutesAt(clientX, target)
    if (minutes === null) return null
    const rect = target.getBoundingClientRect()
    const current = winRef.current
    const inside = onCapsule(clientX - rect.left, rect.width, current)
    return {
      mode: inside ? 'move' : 'create',
      offset: inside ? minutes - current.startMin : 0,
      start: inside ? current.startMin : minutes,
      end: current.endMin,
      x: clientX,
      threshold,
      moved: false,
      from: { startMin: current.startMin, endMin: current.endMin }
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A mouse drags at once; a touch or pen waits for sideways travel, since a vertical swipe here scrolls the page.
    const drag = press(event.clientX, event.currentTarget, event.pointerType === 'mouse' ? 0 : DRAG_THRESHOLD_PX)
    if (!drag) return
    dragRef.current = drag
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // jsdom and some browsers lack pointer capture; drag still works with the pointer down.
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // A release outside the strip (or before the island mounted) ends the drag; hovering never moves the window.
    if (event.buttons === 0) {
      dragRef.current = null
      return
    }
    if (!drag.moved && Math.abs(event.clientX - drag.x) < drag.threshold) return
    drag.moved = true
    const minutes = minutesAt(event.clientX, event.currentTarget)
    if (minutes === null) return
    if (drag.mode === 'move') {
      const length = drag.end - drag.start
      const start = Math.min(1425 - length, Math.max(0, minutes - drag.offset))
      setWin((current) => ({ ...current, startMin: start, endMin: start + length }))
    } else {
      // Dragging left of the press point selects back to it, so the endpoints are ordered first.
      const clamped = clampWindow(Math.min(drag.start, minutes), Math.max(drag.start, minutes))
      setWin((current) => ({ ...current, startMin: clamped.start, endMin: clamped.end }))
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  // WCAG 2.5.2: a cancelled gesture (the browser took it for a scroll, or the touch was interrupted) undoes its change.
  const onPointerCancel = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.moved) setWin((current) => ({ ...current, ...drag.from }))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = stripKeyWindow(event.key, event.shiftKey, win)
    if (!next) return
    event.preventDefault()
    commitTimes(next.start, next.end)
  }

  /** On leaving a time field (or sending the form): read any common form, or mark the field and keep the text. */
  const settleTime = (field: 'start' | 'end', text: string): number | null => {
    const parsed = parseTimeInput(text)
    setInvalid((current) => ({ ...current, [field]: parsed === null }))
    if (parsed === null) return null
    if (field === 'start') {
      commitTimes(parsed, win.endMin)
      setStartText(toLocalTime(parsed))
    } else {
      commitTimes(win.startMin, parsed)
      setEndText(toLocalTime(parsed))
    }
    return parsed
  }

  // Sending the form (Enter in a time field, or Retry) applies both typed times; a new window is read once the
  // debounce settles, the same window at once. A Retry already under way is not sent again.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (submitter?.getAttribute('aria-disabled') === 'true') return
    const start = parseTimeInput(startText)
    const end = parseTimeInput(endText)
    setInvalid({ start: start === null, end: end === null })
    if (start === null || end === null) return
    const clamped = clampWindow(start, end)
    setStartText(toLocalTime(clamped.start))
    setEndText(toLocalTime(clamped.end))
    if (clamped.start !== win.startMin || clamped.end !== win.endMin) {
      setWin({ ...win, startMin: clamped.start, endMin: clamped.end })
    } else if (open) void evaluate(win, true)
  }

  // The form has two text fields and no submit button, so a browser never sends it on Enter: the field does. It reads
  // its own text as leaving it would (marked, and nothing sent, when it cannot), then sends both.
  const onTimeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const field = event.currentTarget.name === 'end' ? 'end' : 'start'
    if (settleTime(field, event.currentTarget.value) === null) return
    event.currentTarget.form?.requestSubmit()
  }

  const strip = result.kind === 'ok' ? stripOf(result.data.strip, win, result.data.evaluated_at) : null
  // A blocked clause silences the gauge even when its inputs list carries no values of its own.
  const groupedForError = result.kind === 'ok' ? groupedVerdicts(result.data.verdicts) : []
  const gaugeError =
    result.kind === 'ok' &&
    (hasGaugeError(groupedForError.flatMap((group) => group.inputs)) ||
      groupedForError.some((group) => group.blocked.length > 0))

  return (
    <>
      <HeroBand
        win={win}
        now={new Date().toISOString()}
        state={skyStateOf(groupedForError)}
        sliderRef={sliderRef}
        sliderProps={{
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel,
          onKeyDown
        }}
      />
      <form
        ref={rootRef}
        method="get"
        action="/"
        onSubmit={onSubmit}
        className={styles.panel}
        data-ui
        id="window"
        aria-label={t('landing-hero.picker_label', {}, 'en')}
      >
        <fieldset className={styles.dates}>
          <legend className={styles.legend}>{t('landing-hero.window_legend', {}, 'en')}</legend>
          {dates.map((date, index) => (
            <label key={date} data-source={CLOCK_SOURCE} className={styles.date}>
              <input
                type="radio"
                name="date"
                value={date}
                checked={win.date === date}
                onChange={() => setWin((current) => ({ ...current, date }))}
              />
              <span>
                {index === 0 ? t('landing-hero.today', {}, 'en') : formatDateCompact(`${date}T12:00:00+08:00`, 'en')}
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.times}>
          <label className={styles.field}>
            <span>{t('landing-hero.start_label', {}, 'en')}</span>
            <input
              type="text"
              inputMode="text"
              enterKeyHint="go"
              placeholder="09:45…"
              name="start"
              autoComplete="off"
              spellCheck={false}
              pattern={TIME_INPUT_PATTERN}
              required
              value={startText}
              aria-invalid={invalid.start || undefined}
              aria-describedby={invalid.start ? timeErrorId : undefined}
              onChange={(event) => {
                setStartText(event.target.value)
                const parsed = parseLocalTime(event.target.value)
                if (parsed !== null) commitTimes(parsed, win.endMin)
              }}
              onBlur={(event) => settleTime('start', event.target.value)}
              onKeyDown={onTimeKeyDown}
            />
          </label>
          <label className={styles.field}>
            <span>{t('landing-hero.end_label', {}, 'en')}</span>
            <input
              type="text"
              inputMode="text"
              enterKeyHint="go"
              placeholder="09:45…"
              name="end"
              autoComplete="off"
              spellCheck={false}
              pattern={TIME_INPUT_PATTERN}
              required
              value={endText}
              aria-invalid={invalid.end || undefined}
              aria-describedby={invalid.end ? timeErrorId : undefined}
              onChange={(event) => {
                setEndText(event.target.value)
                const parsed = parseLocalTime(event.target.value)
                if (parsed !== null) commitTimes(win.startMin, parsed)
              }}
              onBlur={(event) => settleTime('end', event.target.value)}
              onKeyDown={onTimeKeyDown}
            />
          </label>
          {/* The rule for a typed time takes the zone line's place, so a message never pushes the verdict down. */}
          <p
            id={timeErrorId}
            className={styles.zone}
            data-invalid={invalid.start || invalid.end || undefined}
            data-source={CLOCK_SOURCE}
            aria-live="polite"
          >
            {invalid.start || invalid.end
              ? t('landing-hero.time_error', {}, 'en')
              : t('landing-hero.time_zone', {}, 'en')}
          </p>
        </div>
        <div ref={answerRef} className={styles.answer}>
          <HeroStrip strip={strip} initialSvg={initialStripSvg} rainAnimated={!gaugeError && !pending} />
          <div aria-live="polite" aria-busy={pending}>
            <HeroReadout
              result={result}
              win={win}
              latestCall={latest}
              calendarQuery={calendarQuery}
              rainAnimated={!gaugeError}
              replay={replay}
              pending={pending}
            />
          </div>
        </div>
      </form>
    </>
  )
}
