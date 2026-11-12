'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { formatTime } from '@skyclause/i18n/format'

/**
 * The time in Kuala Lumpur, a live fact in the bar. It starts from the request's time, so the server's markup and the
 * first client render agree, then follows the minute.
 */
export function ShellClock({ now }: { now: string }) {
  const [time, setTime] = useState(now)

  // Before the first paint after mounting: a clock mounted later (the phone sheet's) never shows the request's minute.
  useLayoutEffect(() => setTime(new Date().toISOString()), [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const tick = () => setTime(new Date().toISOString())
    const timeout = setTimeout(
      () => {
        tick()
        interval = setInterval(tick, 60_000)
      },
      60_000 - (Date.now() % 60_000)
    )
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  // Only the minute shows: the attribute carries the same minute, so it changes no more often than the text.
  const minute = `${time.slice(0, 16)}Z`
  return (
    <time className="shell-clock" dateTime={minute} data-numeric>
      {formatTime(minute, 'en')}
    </time>
  )
}
