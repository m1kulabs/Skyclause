'use client'

import { useEffect, useRef, useState } from 'react'
import type { StripInput } from '@skyclause/elements'
import { heroStripSvg } from './strip-html'
import styles from './hero.module.css'

export function HeroStrip({
  strip,
  initialSvg,
  rainAnimated
}: {
  strip: StripInput | null
  initialSvg: string | null
  rainAnimated: boolean
}) {
  const [svg, setSvg] = useState(initialSvg)
  const stripRef = useRef(strip)

  // The initial view is server-rendered geometry; the island recomputes the same geometry after data changes.
  useEffect(() => {
    if (strip === stripRef.current) return
    stripRef.current = strip
    setSvg(heroStripSvg(strip))
  }, [strip])

  if (!svg) return null
  return (
    <figure className={styles.rain} data-rain-animated={rainAnimated ? 'yes' : 'no'}>
      <div
        className={styles.rainSvg}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: stripSvg is geometry from derived readings.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  )
}
