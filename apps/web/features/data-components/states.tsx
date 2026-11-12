'use client'

import type { ReactNode, Ref } from 'react'
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
   * means the read is not available yet (no retry, not an error); anything else is a failure to retry.
   */
  status?: number | null
  /** When it failed. */
  at?: string | null
  /** A retry control, such as a Button that refetches; never shown on a 501, which no retry can change. */
  retry?: ReactNode
  locale?: 'en' | 'ms'
}

/**
 * A read that failed or is not available yet, named, inside the block that needed it. Never an empty state: an empty
 * day is only a successful read with nothing in it.
 */
export function SourceError({ source, status = null, at = null, retry = null, locale = 'en' }: SourceErrorProps) {
  const unavailable = status === 501
  const detail = unavailable
    ? null
    : at
      ? t(
          status === null ? 'data.source_error.unreachable' : 'data.source_error.tried',
          { time: formatTime(at, locale) },
          locale
        )
      : null
  return (
    <div
      role="status"
      data-source-error={status ?? 'unreachable'}
      className="flex flex-col items-start gap-2 rounded-xl bg-card p-5"
    >
      <p className="flex items-center gap-2 font-medium">
        <Glyph state={unavailable ? 'off_hours' : 'error'} width={14} height={14} />
        <span>{t(unavailable ? 'data.source_error.unavailable' : 'data.source_error.title', { source }, locale)}</span>
      </p>
      {detail ? (
        <time dateTime={at!} className="text-muted-foreground">
          {detail}
        </time>
      ) : null}
      {unavailable ? null : retry}
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
