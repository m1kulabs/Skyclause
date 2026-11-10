'use client'

// Test-only (built when PLANTED_ROUTES=1): a script-driven animation, which the global reduced-motion CSS can't stop,
// that honours reduced motion from the OS but ignores the account setting. The crawl's account pass must fail it (#116).
import { useEffect, useRef } from 'react'

export default function PlantedMotion() {
  const text = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const element = text.current!
    element.dataset.plantedMotion = 'ready'
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = element.animate([{ opacity: 1 }, { opacity: 0.6 }], { duration: 1000, iterations: Infinity })
    return () => animation.cancel()
  }, [])
  return (
    <>
      <a href="#main" style={{ display: 'inline-block', minHeight: 24 }}>
        Skip to content
      </a>
      <main id="main">
        <h1>Planted motion</h1>
        <p ref={text}>This page exists only in test builds.</p>
      </main>
    </>
  )
}
