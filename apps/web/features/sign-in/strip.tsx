'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { formatClock, formatDateLong } from '@skyclause/i18n/format'
import { ClockTicks } from '../data-components/clock-ticks'
import { LINK_LIFETIME_MS } from './model'
import { t, type Locale } from './i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MYT_OFFSET = 8 * 60 * MINUTE

/** A catalogue string with `{name}` slots filled by elements (a `<time>`, a link) rather than text. */
export function withParts(message: string, parts: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{[a-z_]+\})/).map((piece, index) => {
    const slot = /^\{([a-z_]+)\}$/.exec(piece)?.[1]
    return <Fragment key={index}>{slot && slot in parts ? parts[slot] : piece}</Fragment>
  })
}

/** Today in MYT, midnight to midnight: the strip at rest. */
function daySpan(now: number) {
  const from = Math.floor((now + MYT_OFFSET) / (24 * HOUR)) * 24 * HOUR - MYT_OFFSET
  return { from, to: from + 24 * HOUR }
}

/**
 * While a link is live, the strip shows the stretch around it: from the MYT hour the link was sent in, for 80 minutes.
 * A link's fifteen minutes always lie inside it, about a fifth of the strip wide, so the window reads and narrows
 * visibly; 80 minutes also puts the clock's labels on whole hours and every 40 minutes.
 */
function linkSpan(until: number) {
  const sentAt = until - LINK_LIFETIME_MS
  const from = Math.floor((sentAt + MYT_OFFSET) / HOUR) * HOUR - MYT_OFFSET
  return { from, to: from + 80 * MINUTE }
}

const iso = (value: number) => new Date(value).toISOString()
const percent = (share: number) => `${(Math.min(1, Math.max(0, share)) * 100).toFixed(3)}%`

/**
 * The day strip under the room's photograph: today in Bukit Jalil with "now" marked, ticking with the clock. Once a
 * sign-in link is sent, the strip shows that link's window from now to its real end, narrowing as the time runs out,
 * and says in words until when it works.
 */
export function SignInStrip({
  initialNow,
  until,
  locale
}: {
  /** The server's clock, so the first paint matches; the browser's clock takes over on mount. */
  initialNow: string
  /** The live link's end, or null with no link out. */
  until: number | null
  locale: Locale
}) {
  const [now, setNow] = useState(() => Date.parse(initialNow))
  const live = until !== null && until > now

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, live ? 1000 : 15_000)
    return () => window.clearInterval(timer)
  }, [live])

  const span = live ? linkSpan(until) : daySpan(now)
  const share = (value: number) => (value - span.from) / (span.to - span.from)
  const text = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const clock = (value: number) => <time dateTime={iso(value)}>{formatClock(value, locale)}</time>

  return (
    <div className="sign-in-strip" data-sign-in-strip={live ? 'link' : 'day'}>
      <p className="sign-in-strip-caption">
        {live ? (
          <>
            <span className="sign-in-strip-until">
              {withParts(text('sign-in.strip_until'), { time: clock(until) })}
            </span>
            <span data-numeric>{text('sign-in.strip_left', { minutes: Math.ceil((until - now) / MINUTE) })}</span>
          </>
        ) : (
          <>
            <span>{text('sign-in.strip_today', { date: formatDateLong(now, locale) })}</span>
            <span>{withParts(text('sign-in.strip_now'), { time: clock(now) })}</span>
          </>
        )}
      </p>
      <div className="sign-in-track" aria-hidden="true">
        {live ? (
          <span
            className="sign-in-window"
            data-sign-in-window
            style={{ left: percent(share(now)), width: percent(share(until) - share(now)) }}
          />
        ) : null}
        <span className="sign-in-now" style={{ left: percent(share(now)) }} />
      </div>
      <ClockTicks from={iso(span.from)} to={iso(span.to)} locale={locale} />
    </div>
  )
}
