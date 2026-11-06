'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** The browser must wait for event-driven controls, not just streamed server HTML. */
export function ShellTestReady({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return <div data-shell-ready={ready}>{children}</div>
}
