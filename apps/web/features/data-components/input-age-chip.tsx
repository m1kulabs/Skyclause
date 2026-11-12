'use client'

import { useEffect, useReducer } from 'react'
import type { InputValue } from '@skyclause/contracts'
import { formatAge, formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { Popover, PopoverContent, PopoverTrigger } from '#ui/popover'
import { t } from './catalogue'
import { indicatorName } from './indicator-names'
import { useMounted } from './use-mounted'

export interface InputAgeChipProps {
  input: InputValue
  receiptAt?: string | null
  latencyMs?: number | null
  dailyDate?: string | null
  /** Snapshot age in seconds. Use on historical call evidence instead of aging the reading at view time. */
  ageSeconds?: number | null
  locale?: 'en' | 'ms'
}

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

/** Test-only reset for the shared minute timer. */
export function __resetAgeTimerForTests(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  listeners.clear()
}

function ensureTimer(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    for (const notify of [...listeners]) notify()
  }, 60_000)
}

function useMinuteTick(): number {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    ensureTimer()
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])
  return Date.now()
}

export function InputAgeChip({
  input,
  receiptAt = null,
  latencyMs = null,
  dailyDate = null,
  ageSeconds = null,
  locale = 'en'
}: InputAgeChipProps) {
  useMinuteTick()
  const mounted = useMounted()

  const observed = input.observed_at ?? input.since
  const isError = input.state === 'error'
  const isStale = input.state === 'stale'
  // Server and first client render both read the API's own age, so the label cannot differ at hydration; once live the
  // age follows the clock, a minute at a time.
  const snapshotAge = ageSeconds ?? (mounted ? null : input.age_s)
  const name = indicatorName(input.name, locale)

  const resolvedAge =
    snapshotAge !== null && snapshotAge !== undefined
      ? formatAge(new Date(Date.now() - snapshotAge * 1000), locale)
      : observed
        ? formatAge(observed, locale)
        : null

  let label: string
  let namePart: string
  let agePart: string | null = null
  if (isError) {
    const errorTime = input.since ?? observed
    const time = errorTime ? formatTime(errorTime, locale) : '–'
    label = t('data.age.error', { name, time }, locale)
    namePart = name
    agePart = t('data.age.error', { name: '', time }, locale).trim()
  } else if (dailyDate) {
    label = t('data.age.daily', { date: formatDate(dailyDate, locale) }, locale)
    namePart = label
  } else if (ageSeconds === null && input.observed_at === null && input.value === null) {
    // Nothing observed yet (a new project's inputs): its `since` is when it went stale, not a reading's time.
    label = t('data.age.no_reading', { name }, locale)
    namePart = name
    agePart = t('data.age.no_reading', { name: '' }, locale).trim()
  } else if (resolvedAge !== null) {
    if (isStale) {
      const stale = t('data.age.stale', {}, locale)
      label = t('data.age.label_stale', { name, age: resolvedAge, stale }, locale)
      namePart = name
      agePart = t('data.age.label_stale', { name: '', age: resolvedAge, stale }, locale).trim()
    } else {
      label = t('data.age.label', { name, age: resolvedAge }, locale)
      namePart = name
      agePart = t('data.age.label', { name: '', age: resolvedAge }, locale).trim()
    }
  } else {
    label = name
    namePart = name
  }

  const sourceTime = observed ? formatTime(observed, locale) : '–'
  const received = receiptAt ? formatTime(receiptAt, locale) : sourceTime

  return (
    // A button, so keyboard and touch open the details as hover does.
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        className="group/age inline-flex min-h-[34px] max-w-full min-w-[34px] items-center rounded-full text-left text-[13px] font-medium tabular-nums motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        title={label}
        aria-label={label}
        data-state={input.state}
      >
        {/* A tag, not a button: the raised tone and no edge (high contrast adds its own through data-slot="badge"). */}
        <span
          data-slot="badge"
          className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-full bg-raised px-2.5 whitespace-nowrap in-data-[slot=card]:bg-overlay group-hover/age:bg-accent"
        >
          <Glyph state={input.state} />
          <span className="inline-flex min-w-0 items-center gap-1 leading-snug">
            <span className="min-w-0 truncate">{namePart}</span>
            {agePart ? <span className="shrink-0 whitespace-nowrap"> {agePart}</span> : null}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 gap-0 tabular-nums">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] [&_dt]:text-muted-foreground">
          <dt>{t('data.age.source_time', {}, locale)}</dt>
          <dd>
            <time dateTime={observed ?? undefined}>{sourceTime}</time>
          </dd>
          <dt>{t('data.age.received_time', {}, locale)}</dt>
          <dd>
            {receiptAt ? (
              <time dateTime={receiptAt}>{received}</time>
            ) : (
              <time dateTime={observed ?? undefined}>{sourceTime}</time>
            )}
          </dd>
          <dt>{t('data.age.status', {}, locale)}</dt>
          <dd>{t(`brand.states.${input.state}`, {}, locale)}</dd>
          <dt>{t('data.age.latency', {}, locale)}</dt>
          <dd data-numeric>
            {latencyMs !== null
              ? t('data.age.latency_value', { value: formatNumber(latencyMs, locale) }, locale)
              : t('data.age.latency_unknown', {}, locale)}
          </dd>
        </dl>
      </PopoverContent>
    </Popover>
  )
}
