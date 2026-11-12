'use client'

import { useEffect, useReducer } from 'react'
import type { InputValue } from '@skyclause/contracts'
import { formatAge, formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#ui/hover-card'
import { t } from './catalogue'

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

  const observed = input.observed_at ?? input.since
  const isError = input.state === 'error'
  const isStale = input.state === 'stale'

  let label: string
  if (isError) {
    const since = input.since
      ? formatTime(input.since, locale)
      : formatTime(observed ?? new Date().toISOString(), locale)
    label = t('data.age.error', { name: input.name, time: since }, locale)
  } else if (dailyDate) {
    label = t('data.age.daily', { date: formatDate(dailyDate, locale) }, locale)
  } else if (observed) {
    const age = formatAge(ageSeconds === null ? observed : Date.now() - ageSeconds * 1000, locale)
    label = isStale
      ? t('data.age.label_stale', { name: input.name, age, stale: t('data.age.stale', {}, locale) }, locale)
      : t('data.age.label', { name: input.name, age }, locale)
  } else {
    const age = formatAge(new Date().toISOString(), locale)
    label = t('data.age.label', { name: input.name, age }, locale)
  }

  const sourceTime = observed ? formatTime(observed, locale) : formatTime(new Date().toISOString(), locale)
  const received = receiptAt ? formatTime(receiptAt, locale) : sourceTime

  return (
    <HoverCard>
      <HoverCardTrigger
        className="group/age inline-flex min-h-[34px] min-w-[34px] items-center rounded-full text-[13px] font-medium tabular-nums motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        aria-label={label}
        data-state={input.state}
      >
        <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border-2 border-input px-2.5 group-hover/age:bg-accent">
          <Glyph state={input.state} />
          <span>{label}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="tabular-nums">
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
          <dd>{input.state}</dd>
          <dt>{t('data.age.latency', {}, locale)}</dt>
          <dd>
            {latencyMs !== null
              ? t('data.age.latency_value', { value: latencyMs }, locale)
              : t('data.age.latency_value', { value: 0 }, locale)}
          </dd>
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}
