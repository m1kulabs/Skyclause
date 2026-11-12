'use client'

import { useEffect } from 'react'

const INTENT = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** Reduced motion from the OS or the account (`html[data-motion='reduce']`): final states at once, nothing loads. */
export function motionReduced(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motion === 'reduce'
  )
}

// The landing's only eager motion script. GSAP, ScrollTrigger and Lenis load by dynamic import after the visitor's
// first wheel, touch, pointer or key event (never on load or idle, which the 150 KB budget counts), and set up in an
// idle callback after it. It also marks a hidden tab so the photographs' crossfade pauses.
export function MotionBoot() {
  useEffect(() => {
    const root = document.documentElement
    const onVisibility = () => {
      root.dataset.tab = document.visibilityState === 'hidden' ? 'hidden' : 'visible'
    }
    document.addEventListener('visibilitychange', onVisibility)
    let cancelled = false
    let stop: (() => void) | null = null
    const start = () => {
      for (const name of INTENT) window.removeEventListener(name, start)
      if (motionReduced()) return
      const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1))
      idle(() => {
        void import('./motion').then(({ startMotion }) => {
          if (!cancelled && !motionReduced()) stop = startMotion()
        })
      })
    }
    for (const name of INTENT) window.addEventListener(name, start, { passive: true, once: true })
    return () => {
      cancelled = true
      for (const name of INTENT) window.removeEventListener(name, start)
      document.removeEventListener('visibilitychange', onVisibility)
      stop?.()
    }
  }, [])
  return null
}
