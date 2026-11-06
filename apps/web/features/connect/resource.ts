'use client'

import { useEffect, useState } from 'react'

export type Resource<Value> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: Value }

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
      () => {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    )
    return () => controller.abort()
  }, [read, version])
  return [state, () => setVersion((value) => value + 1)]
}
