'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from './catalogue'
import { fetchEvaluate, fetchLatestCall, type EvaluateResult, type LatestCall } from './evaluate'
import type { PickerReplay } from './activator'
import { HeroReadout } from './readout'
import { HeroStrip } from './hero-strip'
import {
  CLOCK_SOURCE,
  beaconEventOf,
  clampWindow,
  groupedVerdicts,
  hasGaugeError,
  parseLocalTime,
  snapToStep,
  stripOf,
  toLocalTime,
  windowInstants,
  type HeroWindow
} from './window-model'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import styles from './hero.module.css'

export interface HeroPickerProps {
  initialResult: EvaluateResult
  initialStripSvg: string | null
  initialWin: HeroWindow
  dates: string[]
  latestCall: LatestCall | null
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

  // The first intent that mounted this island is replayed once, so the click or key is not lost.
  useEffect(() => {
    if (replayDoneRef.current || !initialReplay) return
    replayDoneRef.current = true
    const replay: PickerReplay = initialReplay
    if (replay.k === 'fld' && replay.n && replay.v) {
      if (replay.n === 'date' && dates.includes(replay.v)) {
        setWin((current) => ({ ...current, date: replay.v! }))
      } else if (replay.n === 'start' || replay.n === 'end') {
        const parsed = parseLocalTime(replay.v)
        if (parsed !== null) {
          if (replay.n === 'start') commitTimes(parsed, winRef.current.endMin)
          else commitTimes(winRef.current.startMin, parsed)
        }
      }
    } else if (replay.k === 'key' && replay.key?.slice(0, 5) === 'Arrow') {
      const delta = replay.key === 'ArrowRight' || replay.key === 'ArrowDown' ? 15 : -15
      if (replay.shift) commitTimes(winRef.current.startMin, winRef.current.endMin + delta)
      else {
        const length = winRef.current.endMin - winRef.current.startMin
        const start = Math.min(1425 - length, Math.max(0, winRef.current.startMin + delta))
        commitTimes(start, start + length)
      }
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
        if (id === requestRef.current) setLatest(fetchedLatest)
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
    const minutes = minutesAt(event.clientX, event.currentTarget)
    if (minutes === null) return
    if (drag.mode === 'move') {
      const length = drag.end - drag.start
      const start = Math.min(1425 - length, Math.max(0, minutes - drag.offset))
      setWin((current) => ({ ...current, startMin: start, endMin: start + length }))
    } else {
      const clamped = clampWindow(drag.start, minutes)
      setWin((current) => ({ ...current, startMin: clamped.start, endMin: clamped.end }))
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 15 : -15
    if (event.shiftKey) {
      commitTimes(win.startMin, win.endMin + delta)
    } else {
      const length = win.endMin - win.startMin
      const start = Math.min(1425 - length, Math.max(0, win.startMin + delta))
      commitTimes(start, start + length)
    }
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void evaluate(win, true)
  }

  const hours = [0, 6, 12, 18]
  const instants = windowInstants(win)
  const strip = result.kind === 'ok' ? stripOf(result.data.strip, win, result.data.evaluated_at) : null
  // A blocked clause silences the gauge even when its inputs list carries no values of its own.
  const groupedForError = result.kind === 'ok' ? groupedVerdicts(result.data.verdicts) : []
  const gaugeError =
    result.kind === 'ok' &&
    (hasGaugeError(groupedForError.flatMap((group) => group.inputs)) ||
      groupedForError.some((group) => group.blocked.length > 0))
  const windowText = t(
    'landing-hero.window_text',
    { start: formatTime(instants.from, 'en'), end: formatTime(instants.to, 'en') },
    'en'
  )

  return (
    <form
      ref={rootRef}
      method="get"
      action="/"
      onSubmit={onSubmit}
      className={styles.heroPicker}
      data-ui
      aria-label={t('landing-hero.picker_label', {}, 'en')}
    >
      <fieldset className={styles.heroDates}>
        <legend>{t('landing-hero.date_label', {}, 'en')}</legend>
        {dates.map((date, index) => (
          <label key={date} data-source={CLOCK_SOURCE} className={styles.heroDate}>
            <input
              type="radio"
              name="date"
              value={date}
              checked={win.date === date}
              onChange={() => setWin((current) => ({ ...current, date }))}
            />
            <span>{index === 0 ? t('landing-hero.today', {}, 'en') : formatDate(`${date}T12:00:00+08:00`, 'en')}</span>
          </label>
        ))}
      </fieldset>
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={t('landing-hero.strip_label', {}, 'en')}
        aria-valuemin={0}
        aria-valuemax={1425}
        aria-valuenow={win.startMin}
        aria-valuetext={windowText}
        className={styles.heroSlider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <HeroStrip strip={strip} initialSvg={initialStripSvg} rainAnimated={!gaugeError && !pending} />
        {!strip ? (
          <div className={styles.heroHours} aria-hidden="true">
            {hours.map((hour) => (
              <span key={hour} data-source={CLOCK_SOURCE}>
                {formatTime(
                  new Date(Date.parse(instants.from) - win.startMin * 60_000 + hour * 3600_000).toISOString(),
                  'en'
                )}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.heroTimes}>
        <label>
          {t('landing-hero.start_label', {}, 'en')}
          <input
            type="text"
            inputMode="numeric"
            placeholder="09:45…"
            name="start"
            autoComplete="off"
            step={900}
            required
            value={startText}
            onChange={(event) => {
              setStartText(event.target.value)
              const parsed = parseLocalTime(event.target.value)
              if (parsed !== null) commitTimes(parsed, win.endMin)
            }}
            onBlur={() => setStartText(toLocalTime(win.startMin))}
          />
        </label>
        <label>
          {t('landing-hero.end_label', {}, 'en')}
          <input
            type="text"
            inputMode="numeric"
            placeholder="09:45…"
            name="end"
            autoComplete="off"
            step={900}
            required
            value={endText}
            onChange={(event) => {
              setEndText(event.target.value)
              const parsed = parseLocalTime(event.target.value)
              if (parsed !== null) commitTimes(win.startMin, parsed)
            }}
            onBlur={() => setEndText(toLocalTime(win.endMin))}
          />
        </label>
      </div>
      <div aria-busy={pending}>
        <HeroReadout
          result={result}
          win={win}
          latestCall={latest}
          calendarQuery={calendarQuery}
          rainAnimated={!gaugeError}
        />
      </div>
    </form>
  )
}
