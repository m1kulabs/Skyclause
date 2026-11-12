/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is English in the component (no Malay landing route; LND-7 is P2). */
'use client'

import { useEffect, useState } from 'react'

function mytTime(date: Date): string {
  const myt = new Date(date.getTime() + 8 * 3_600_000)
  return `${myt.toISOString().slice(11, 16)} MYT`
}

export function FooterClock({ initial }: { initial?: string }) {
  // No time prints until the browser reads its clock: a fixed placeholder would read as the live time.
  const [now, setNow] = useState(initial ?? '')
  const [iso, setIso] = useState('')
  useEffect(() => {
    const tick = () => {
      const date = new Date()
      setNow(mytTime(date))
      setIso(date.toISOString())
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span data-source="clock:Asia/Kuala_Lumpur">
      Now in Kuala Lumpur
      {now ? (
        <>
          : <time dateTime={iso || undefined}>{now}</time>
        </>
      ) : null}
    </span>
  )
}
