/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
'use client'

import { useEffect, useState } from 'react'
import { formatTime } from '@skyclause/i18n/format'

export interface ClockReading {
  iso: string
  text: string
}

/** The time in MYT by the shared formatter, ticking each minute; `initial` is the server's reading, or nothing. */
function useMytClock(initial: ClockReading | null): ClockReading | null {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const tick = () => {
      const iso = new Date().toISOString()
      setNow({ iso, text: formatTime(iso, 'en') })
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** The hero's "now": the server's reading at render (so the page is complete without script), then the browser's. */
export function MytClock({ initial }: { initial: ClockReading }) {
  const now = useMytClock(initial)
  return now ? <time dateTime={now.iso}>{now.text}</time> : null
}

export function FooterClock() {
  // No time prints until the browser reads its clock: the footer's line stands without one.
  const now = useMytClock(null)
  return (
    <span data-source="clock:Asia/Kuala_Lumpur">
      Now in Kuala Lumpur
      {now ? (
        <>
          : <time dateTime={now.iso}>{now.text}</time>
        </>
      ) : null}
    </span>
  )
}
