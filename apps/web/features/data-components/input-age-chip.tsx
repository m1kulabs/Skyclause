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
    const age = formatAge(observed, locale)
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
        className="inline-flex min-h-[34px] min-w-[34px] items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        aria-label={label}
      >
        <span className="inline-flex items-center gap-1">
          <Glyph state={input.state} />
          <span>{label}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="tabular-nums">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
