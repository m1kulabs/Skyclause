'use client'

import { useEffect, useState } from 'react'

/** Abort old reads on URL changes; never present an unavailable source as an empty result. */
export function useRead<Value>(read: (signal: AbortSignal) => Promise<Value>, poll = false) {
  const [state, setState] = useState<{ read: typeof read; data?: Value; error?: unknown; loading: boolean }>({
    read,
    loading: true
  })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ read, loading: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const data = await read(controller.signal)
        if (!controller.signal.aborted) setState({ read, data, loading: false })
      } catch (error) {
        if (!controller.signal.aborted) setState({ read, error, loading: false })
      }
      if (!controller.signal.aborted && poll)
        timer = setTimeout(() => {
          if (document.visibilityState === 'visible') void load()
          else timer = setTimeout(load, 5000)
        }, 5000)
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [read, revision, poll])
  // A changed URL must not remount the old table under the new filters before the effect runs.
  return {
    ...(state.read === read ? state : { data: undefined, error: undefined, loading: true }),
    retry: () => setRevision((value) => value + 1)
  }
}
