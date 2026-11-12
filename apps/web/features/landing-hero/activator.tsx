'use client'

import { Suspense, lazy, useState, type ReactNode } from 'react'
import type { HeroPickerProps } from './hero-picker'

// The island (drag, debounce, minute refresh) loads on first intent, so the landing ships
// server-rendered markup without picker JavaScript before first input (budgets.spec). Its wrapper has no box
// (display: contents, `.hero-island` in landing.css; a CSS module here would ship its class map before input), so the
// band and the window form sit in the hero's grid as the card and the room need them.
export interface HeroActivatorProps extends HeroPickerProps {
  children: ReactNode
}

export interface PickerReplay {
  k: 'key' | 'ptr' | 'fld'
  key?: string
  shift?: boolean
  x?: number
  n?: string
  v?: string
}

const HeroPicker = lazy(() => import('./hero-picker'))

// The keys the strip answers as a slider (window-model's stripKeyWindow); the same keys in a time field or on a date
// radio stay with that control. Kept here, not imported, so the pre-interaction script carries no window model.
const STRIP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

export function HeroActivator(props: HeroActivatorProps) {
  const [replay, setReplay] = useState<PickerReplay | null>(null)

  if (!replay) {
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- passive intent listener; the static children are natively interactive.
      <div
        className="hero-island"
        onPointerDown={(event) => {
          // Only a strip press replays as a drag; other presses finish natively and activate through onChange.
          if ((event.target as Element).closest('[role="slider"]')) setReplay({ k: 'ptr', x: event.clientX })
        }}
        onKeyDown={(event) => {
          if (STRIP_KEYS.has(event.key) && (event.target as Element).closest('[role="slider"]'))
            setReplay({ k: 'key', key: event.key, shift: event.shiftKey })
        }}
        onChange={(event) => {
          const target = event.target as HTMLInputElement
          setReplay({ k: 'fld', n: target.name, v: target.value })
        }}
      >
        {props.children}
      </div>
    )
  }
  return (
    <div className="hero-island">
      <Suspense fallback={props.children}>
        <HeroPicker {...props} initialReplay={replay} />
      </Suspense>
    </div>
  )
}
