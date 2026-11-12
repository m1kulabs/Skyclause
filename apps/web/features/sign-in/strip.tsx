'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { formatClock } from '@skyclause/i18n/format'
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

/**
 * The stretch the strip shows around a link: from the MYT hour the link starts in, for 80 minutes. A link's fifteen
 * minutes always lie inside it, about a fifth of the strip wide, so the window reads and narrows visibly; 80 minutes
 * also puts the clock's labels on whole hours and every 40 minutes.
 */
function linkSpan(until: number) {
  const sentAt = until - LINK_LIFETIME_MS
  const from = Math.floor((sentAt + MYT_OFFSET) / HOUR) * HOUR - MYT_OFFSET
  return { from, to: from + 80 * MINUTE }
}

const iso = (value: number) => new Date(value).toISOString()
const percent = (share: number) => `${(Math.min(1, Math.max(0, share)) * 100).toFixed(3)}%`

/**
 * The strip under the room's photograph: the sign-in link's window around now, ticking with the clock.
 *
 * - At rest it draws, dotted, the window a link sent now would have, from now to the real end of its lifetime, and says
 *   in words until when that link would work.
 * - Once a link is out, the same window fills and narrows from now to the link's real end.
 * - When the link expires, its closed window stays where it was, in the expired tone, until the clock leaves the
 *   stretch; then the strip is at rest again.
 */
export function SignInStrip({
  initialNow,
  until,
  closed,
  locale
}: {
  /** The server's clock, so the first paint (and the page without script) shows the request's time. */
  initialNow: string
  /** The live link's end, or null with no link out. */
  until: number | null
  /** The end of a link that has expired, or null. */
  closed: number | null
  locale: Locale
}) {
  const [now, setNow] = useState(() => Date.parse(initialNow))

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const live = until !== null && until > now
  const ended = closed ?? (until !== null && !live ? until : null)
  const closedSpan = ended !== null ? linkSpan(ended) : null
  const phase = live ? 'link' : closedSpan && now < closedSpan.to ? 'closed' : 'rest'
  const end = live && until !== null ? until : now + LINK_LIFETIME_MS
  const span = phase === 'closed' ? closedSpan! : linkSpan(end)
  const share = (value: number) => (value - span.from) / (span.to - span.from)
  const text = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const clock = (value: number) => <time dateTime={iso(value)}>{formatClock(value, locale)}</time>
  const windowFrom = phase === 'closed' ? ended! - LINK_LIFETIME_MS : now
  const windowTo = phase === 'closed' ? ended! : end

  return (
    <div className="sign-in-strip" data-sign-in-strip={phase}>
      <p className="sign-in-strip-caption">
        {/* Every phase's line sits in one slot and only the current one shows, so the strip keeps one height. */}
        <span className="sign-in-strip-label">
          {(
            [
              ['rest', 'sign-in.strip_ready', now + LINK_LIFETIME_MS],
              ['link', 'sign-in.strip_until', end],
              ['closed', 'sign-in.strip_closed', ended ?? now]
            ] as const
          ).map(([key, message, time]) => (
            <span key={key} className="sign-in-strip-until" data-phase={key} data-shown={key === phase || undefined}>
              {withParts(text(message), { time: clock(time) })}
            </span>
          ))}
        </span>
        {phase === 'link' ? (
          <span data-numeric>{text('sign-in.strip_left', { minutes: Math.ceil((end - now) / MINUTE) })}</span>
        ) : (
          <span>{withParts(text('sign-in.strip_now'), { time: clock(now) })}</span>
        )}
      </p>
      <div className="sign-in-track" aria-hidden="true">
        {/* One element from rest to sent, so the dotted window fills in place; the closed one is drawn anew. */}
        <span
          key={phase === 'closed' ? 'closed' : 'window'}
          className="sign-in-window"
          data-sign-in-window={phase === 'link' ? 'live' : phase === 'closed' ? 'closed' : 'ready'}
          data-tone={phase === 'closed' ? 'expired' : phase === 'rest' ? 'no-call' : undefined}
          style={{ left: percent(share(windowFrom)), width: percent(share(windowTo) - share(windowFrom)) }}
        />
        <span className="sign-in-now" style={{ left: percent(share(now)) }} />
      </div>
      <ClockTicks from={iso(span.from)} to={iso(span.to)} locale={locale} />
    </div>
  )
}
