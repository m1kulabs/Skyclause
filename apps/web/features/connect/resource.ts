'use client'

import { useEffect, useState } from 'react'

/** A failed read keeps what failed and when, so the screen can name the read and its answer. */
export type Resource<Value> =
  { kind: 'loading' } | { kind: 'error'; error: unknown; at: string } | { kind: 'ready'; value: Value }

export function useResource<Value>(read: (signal: AbortSignal) => Promise<Value>): [Resource<Value>, () => void] {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Resource<Value>>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })
    read(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', value })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ kind: 'error', error, at: new Date().toISOString() })
      }
    )
    return () => controller.abort()
  }, [read, version])
  return [state, () => setVersion((value) => value + 1)]
}
