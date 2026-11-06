import type { Activity } from './operations'

export type Listening = { kind: 'waiting' | 'timeout' | 'error' } | { kind: 'received'; request: Activity }

interface Options {
  read: (signal: AbortSignal) => Promise<{ data: Activity[]; next_cursor: string | null }>
  change: (state: Listening) => void
  visibility: EventTarget & { readonly visibilityState: string }
}

/** One listener per page visit: no background reads, overlapping reads, or updates after cleanup. */
export function startListening({ read, change, visibility }: Options): () => void {
  const deadline = Date.now() + 600_000
  let done = false
  let request: AbortController | undefined
  let next: ReturnType<typeof setTimeout> | undefined
  const timeout = setTimeout(() => finish({ kind: 'timeout' }), 600_000)

  function finish(state: Listening) {
    if (done) return
    cleanup()
    change(state)
  }

  function cleanup() {
    done = true
    clearTimeout(timeout)
    clearTimeout(next)
    request?.abort()
    visibility.removeEventListener('visibilitychange', visible)
  }

  async function poll() {
    if (done || visibility.visibilityState !== 'visible') return
    if (Date.now() >= deadline) return finish({ kind: 'timeout' })
    const controller = new AbortController()
    request = controller
    try {
      const page = await read(controller.signal)
      if (done || controller.signal.aborted) return
      if (page.data[0]) return finish({ kind: 'received', request: page.data[0] })
      next = setTimeout(() => void poll(), 5000)
    } catch {
      if (!done && !controller.signal.aborted) finish({ kind: 'error' })
    }
  }

  function visible() {
    clearTimeout(next)
    request?.abort()
    if (!done && visibility.visibilityState === 'visible') void poll()
  }

  visibility.addEventListener('visibilitychange', visible)
  void poll()
  return cleanup
}
