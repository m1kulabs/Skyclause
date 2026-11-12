'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
  initialReplay?: PickerReplay | null
}

function beaconEndpoint(): string {
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  const [first, ...rest] = hostname.split('.')
  return (first === 'app' || first === 'embed') && rest.length > 1
    ? `${window.location.protocol}//${rest.join('.')}/e`
    : '/e'
}

export default function HeroPicker({
  initialResult,
  initialStripSvg,
  initialWin,
  dates,
  latestCall,
  pilot,
  calendarQuery,
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
  const dragRef = useRef<{ mode: 'move' | 'create'; offset: number; start: number; end: number } | null>(null)
  const beaconedRef = useRef(`${initialWin.date}|${initialWin.startMin}|${initialWin.endMin}`)
  const requestRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winRef = useRef(win)
  winRef.current = win
  const sliderRef = useRef<HTMLDivElement>(null)
  const replayDoneRef = useRef(false)
  const firstSyncRef = useRef(false)

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
      const minutes = minutesAt(replay.x, sliderRef.current)
      const current = winRef.current
      const inside = minutes !== null && minutes >= current.startMin && minutes < current.endMin
      if (minutes !== null) {
        dragRef.current = inside
          ? { mode: 'move', offset: minutes - current.startMin, start: current.startMin, end: current.endMin }
          : { mode: 'create', offset: 0, start: minutes, end: current.endMin }
      }
    }
  }, [])

  const evaluate = useCallback(
    async (next: HeroWindow, beacon: boolean) => {
      const id = ++requestRef.current
      setPending(true)
      const outcome = await fetchEvaluate(next)
      if (id !== requestRef.current) return
      setPending(false)
      setResult(outcome)
      if (outcome.kind === 'ok') {
        const fetchedLatest = await fetchLatestCall(pilot)
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
        const params = new URLSearchParams({
          date: next.date,
          start: toLocalTime(next.startMin),
          end: toLocalTime(next.endMin)
        })
        window.history.replaceState(null, '', `/?${params.toString()}`)
      }
    },
    [pilot]
  )

  useEffect(() => {
    if (firstWindowRef.current) {
      firstWindowRef.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void evaluate(win, true), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [evaluate, win])

  useEffect(() => {
    const timer = setInterval(() => {
      if (visibleRef.current && document.visibilityState !== 'hidden') void evaluate(winRef.current, false)
    }, 60_000)
    return () => clearInterval(timer)
  }, [evaluate])

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const minutes = minutesAt(event.clientX, event.currentTarget)
    if (minutes === null) return
    const inside = minutes >= win.startMin && minutes < win.endMin
    dragRef.current = {
      mode: inside ? 'move' : 'create',
      offset: inside ? minutes - win.startMin : 0,
      // A press outside the window anchors a new window at the press point.
      start: inside ? win.startMin : minutes,
      end: win.endMin
    }
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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const start = parseTimeInput(startText)
    const end = parseTimeInput(endText)
    setInvalid({ start: start === null, end: end === null })
    if (start === null || end === null) return
    const clamped = clampWindow(start, end)
    const next = { ...win, startMin: clamped.start, endMin: clamped.end }
    setWin(next)
    void evaluate(next, true)
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
          onPointerCancel: onPointerUp,
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
            />
          </label>
          <p className={styles.zone}>{t('landing-hero.time_zone', {}, 'en')}</p>
          <p id={timeErrorId} className={styles.timeError} aria-live="polite">
            {invalid.start || invalid.end ? t('landing-hero.time_error', {}, 'en') : null}
          </p>
        </div>
        <HeroStrip strip={strip} initialSvg={initialStripSvg} rainAnimated={!gaugeError && !pending} />
        <div aria-live="polite" aria-busy={pending}>
          <HeroReadout
            result={result}
            win={win}
            latestCall={latest}
            calendarQuery={calendarQuery}
            rainAnimated={!gaugeError}
          />
        </div>
      </form>
    </>
  )
}
