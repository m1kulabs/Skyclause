'use client'

import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'

export interface NoCallStateProps {
  /** The display names of the required inputs that are failing; empty when the reason is not known here. */
  inputs?: readonly string[]
  /** When the earliest of them started failing. */
  since?: string | null
  locale?: 'en' | 'ms'
}

/** No call: the dashed capsule with its glyph and word, and which inputs failed since when. */
export function NoCallState({ inputs = [], since = null, locale = 'en' }: NoCallStateProps) {
  return (
    <div data-no-call className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusMark state="no_call" locale={locale} />
      <span>
        {inputs.length && since ? (
          <time dateTime={since}>
            {t('data.no_call.reason', { inputs: inputs.join(', '), time: formatTime(since, locale) }, locale)}
          </time>
        ) : (
          t('data.no_call.reason_plain', {}, locale)
        )}
      </span>
    </div>
  )
}

export interface SourceErrorProps {
  /** The source or read that failed, as it reads mid-sentence ("the windows list", "JPS station 75"). */
  source: string
  /**
   * The HTTP status it answered, null when it did not answer. Kept on `data-source-error` for tests, never shown: 501
   * means the read is not available yet (no retry, not an error); 429 means Skyclause is busy (retry once the time
   * comes); anything else is a failure to retry.
   */
  status?: number | null
  /** When it failed. */
  at?: string | null
  /** On a 429, when the API said to try again (`ApiProblem.retryAt`); without it, a minute after `at`. */
  retryAt?: string | null
  /** A retry control, such as a Button that refetches; never shown on a 501, which no retry can change. */
  retry?: ReactNode
  locale?: 'en' | 'ms'
}

/** How long a rate-limited read waits when the API gave no time. */
const BUSY_WAIT_MS = 60_000

/** Whether `until` has passed, checked again when it comes; closed on the first render so the server and client agree. */
function useOpenAfter(until: string | null): boolean {
  const [open, setOpen] = useState(until === null)
  useEffect(() => {
    const wait = until === null ? 0 : Date.parse(until) - Date.now()
    if (!(wait > 0)) {
      setOpen(true)
      return
    }
    setOpen(false)
    const timer = setTimeout(() => setOpen(true), wait)
    return () => clearTimeout(timer)
  }, [until])
  return open
}

/**
 * A read that failed or is not available yet, named, inside the block that needed it. Never an empty state: an empty
 * day is only a successful read with nothing in it.
 */
export function SourceError({
  source,
  status = null,
  at = null,
  retryAt = null,
  retry = null,
  locale = 'en'
}: SourceErrorProps) {
  const unavailable = status === 501
  const busy = status === 429
  const until = busy ? (retryAt ?? (at ? new Date(Date.parse(at) + BUSY_WAIT_MS).toISOString() : null)) : null
  const open = useOpenAfter(until)
  const detail = unavailable
    ? null
    : busy
      ? until
        ? t('data.source_error.busy_until', { time: formatTime(until, locale) }, locale)
        : t('data.source_error.busy_later', {}, locale)
      : at
        ? t(
            status === null ? 'data.source_error.unreachable' : 'data.source_error.tried',
            { time: formatTime(at, locale) },
            locale
          )
        : null
  const title = unavailable
    ? 'data.source_error.unavailable'
    : busy
      ? 'data.source_error.busy'
      : 'data.source_error.title'
  return (
    <div
      role="status"
      data-source-error={status ?? 'unreachable'}
      className="flex flex-col items-start gap-2 rounded-xl bg-card p-5"
    >
      <p className="flex items-center gap-2 font-medium">
        <Glyph state={unavailable ? 'off_hours' : busy ? 'pending' : 'error'} width={14} height={14} />
        <span>{t(title, { source }, locale)}</span>
      </p>
      {detail ? (
        busy && !until ? (
          <p className="text-muted-foreground">{detail}</p>
        ) : (
          <time dateTime={(busy ? until : at)!} className="text-muted-foreground">
            {detail}
          </time>
        )
      ) : null}
      {unavailable ? null : busy && retry ? (
        // Until the time comes, Retry is there but disabled: pressing it would only be refused again.
        <fieldset disabled={!open} className="m-0 min-w-0 border-0 p-0">
          {retry}
        </fieldset>
      ) : (
        retry
      )}
    </div>
  )
}

export interface NotBuiltProps {
  /** The whole sentence saying what is not available yet, from the caller's catalogue ("AI keys are not available yet."). */
  title: string
  /** What is available instead, or the one next action that works. */
  children?: ReactNode
  /** For a notice that takes the place of the control that had focus: it can take focus itself. */
  ref?: Ref<HTMLDivElement>
}

/**
 * A part of the product that is not available yet, said plainly. No read was attempted, so it is not a SourceError; it
 * is not an empty state either, since nothing could ever fill it.
 */
export function NotBuilt({ title, children, ref }: NotBuiltProps) {
  return (
    <div
      ref={ref}
      tabIndex={ref ? -1 : undefined}
      role="status"
      data-not-built
      className="flex flex-col items-start gap-2 rounded-xl bg-card p-5"
    >
      <p className="flex items-center gap-2 font-medium">
        <Glyph state="off_hours" width={14} height={14} />
        <span>{title}</span>
      </p>
      {children}
    </div>
  )
}
