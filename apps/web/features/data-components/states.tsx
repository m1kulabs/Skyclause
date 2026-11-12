'use client'

import type { ReactNode } from 'react'
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
  /** The HTTP status it answered; 501 means not built yet; null when it did not answer. */
  status?: number | null
  /** When it failed. */
  at?: string | null
  /** A retry control, such as a Button that refetches; never shown on a 501, which no retry can change. */
  retry?: ReactNode
  locale?: 'en' | 'ms'
}

/**
 * A read that failed or is not built, named, inside the block that needed it. Never an empty state: an empty day is
 * only a successful read with nothing in it.
 */
export function SourceError({ source, status = null, at = null, retry = null, locale = 'en' }: SourceErrorProps) {
  const detail =
    status === 501
      ? t('data.source_error.not_built', {}, locale)
      : status !== null
        ? at
          ? t('data.source_error.status', { status, time: formatTime(at, locale) }, locale)
          : t('data.source_error.status_untimed', { status }, locale)
        : at
          ? t('data.source_error.unreachable', { time: formatTime(at, locale) }, locale)
          : null
  return (
    <div
      role="status"
      data-source-error={status ?? 'unreachable'}
      className="flex flex-col items-start gap-2 rounded-xl bg-card p-5"
    >
      <p className="flex items-center gap-2 font-medium">
        <Glyph state="error" width={14} height={14} />
        <span>{t('data.source_error.title', { source }, locale)}</span>
      </p>
      {detail ? (
        at ? (
          <time dateTime={at} className="text-muted-foreground">
            {detail}
          </time>
        ) : (
          <p className="text-muted-foreground">{detail}</p>
        )
      ) : null}
      {status === 501 ? null : retry}
    </div>
  )
}

export interface NotBuiltProps {
  /** What is not built, as it starts a sentence ("The key panel", "Webhooks"). */
  thing: string
  locale?: 'en' | 'ms'
}

/**
 * A part of the product that does not exist yet, said plainly. No read was attempted, so it is not a SourceError; it
 * is not an empty state either, since nothing could ever fill it.
 */
export function NotBuilt({ thing, locale = 'en' }: NotBuiltProps) {
  return (
    <div role="status" data-not-built className="flex flex-col items-start gap-2 rounded-xl bg-card p-5">
      <p className="flex items-center gap-2 font-medium">
        <Glyph state="off_hours" width={14} height={14} />
        <span>{t('data.not_built.title', { thing }, locale)}</span>
      </p>
      <p className="text-muted-foreground">{t('data.not_built.detail', {}, locale)}</p>
    </div>
  )
}
