'use client'

import { Suspense, lazy, useState, type ReactNode } from 'react'
import type { HeroPickerProps } from './hero-picker'
import styles from './hero.module.css'

// The island (drag, debounce, minute refresh) loads on first intent, so the landing ships
// server-rendered markup without picker JavaScript before first input (budgets.spec). Its wrapper has no box
// (display: contents), so the band and the window form sit in the hero's grid as the card and the room need them.
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

export function HeroActivator(props: HeroActivatorProps) {
  const [replay, setReplay] = useState<PickerReplay | null>(null)

  if (!replay) {
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- passive intent listener; the static children are natively interactive.
      <div
        className={styles.island}
        onPointerDown={(event) => {
          // Only a strip press replays as a drag; other presses finish natively and activate through onChange.
          if ((event.target as Element).closest('[role="slider"]')) setReplay({ k: 'ptr', x: event.clientX })
        }}
        onKeyDown={(event) => {
          if (event.key[0] === 'A') setReplay({ k: 'key', key: event.key, shift: event.shiftKey })
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
    <div className={styles.island}>
      <Suspense fallback={props.children}>
        <HeroPicker {...props} initialReplay={replay} />
      </Suspense>
    </div>
  )
}
