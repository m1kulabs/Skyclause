'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export type ReadState<Value> =
  { status: 'loading' } | { status: 'error'; error: unknown; at: string } | { status: 'ready'; value: Value }

const loading = { status: 'loading' } as const

/** One read per `read` identity; `retry` reads again. A failure keeps when it happened, for its error line. */
export function useRead<Value>(
  read: (signal: AbortSignal) => Promise<Value>
): ReadState<Value> & { retry: () => void } {
  const [result, setResult] = useState<{ read: typeof read; revision: number; state: ReadState<Value> }>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    read(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setResult({ read, revision, state: { status: 'ready', value } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ read, revision, state: { status: 'error', error, at: new Date().toISOString() } })
      }
    )
    return () => controller.abort()
  }, [read, revision])
  const retry = useCallback(() => setRevision((value) => value + 1), [])
  const state = result?.read === read && result.revision === revision ? result.state : loading
  // A stable result: callers (the project overview too) use it as an effect dependency.
  return useMemo(() => ({ ...state, retry }), [state, retry])
}
