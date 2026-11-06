'use client'

import { useEffect, useState } from 'react'

export type ReadState<Value> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; value: Value }

const loading = { status: 'loading' } as const

export function useRead<Value>(read: (signal: AbortSignal) => Promise<Value>): ReadState<Value> {
  const [result, setResult] = useState<{ read: typeof read; state: ReadState<Value> }>()
  useEffect(() => {
    const controller = new AbortController()
    read(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setResult({ read, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ read, state: { status: 'error', error } })
      }
    )
    return () => controller.abort()
  }, [read])
  return result?.read === read ? result.state : loading
}
