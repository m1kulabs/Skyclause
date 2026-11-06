export const UNDO_DELAY_MS = 10_000

export type DeferredCommit = (options: { keepalive: boolean }) => void | Promise<void>

interface Snapshot {
  pending: boolean
  committing: boolean
  error: unknown
}

/** The hook's timer store. No request is sent until the deadline or flush. */
export function createUndoableAction(commit: DeferredCommit, lifecycle?: EventTarget) {
  let snapshot: Snapshot = { pending: false, committing: false, error: null }
  let pendingCommit = commit
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: Snapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
    lifecycle?.removeEventListener('pagehide', onPageHide)
  }
  const onPageHide = () => execute(true)
  const execute = (keepalive: boolean) => {
    if (!snapshot.pending) return
    clear()
    publish({ pending: false, committing: true, error: null })
    // Invoke synchronously: pagehide cannot wait for a microtask to start the request.
    try {
      Promise.resolve(pendingCommit({ keepalive })).then(
        () => publish({ pending: false, committing: false, error: null }),
        (error: unknown) => publish({ pending: false, committing: false, error })
      )
    } catch (error) {
      publish({ pending: false, committing: false, error })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start(selectedCommit = commit) {
      if (snapshot.pending || snapshot.committing) return false
      pendingCommit = selectedCommit
      publish({ pending: true, committing: false, error: null })
      // The action, rather than the component, owns this listener and the deadline.
      lifecycle?.addEventListener('pagehide', onPageHide)
      timer = setTimeout(() => execute(false), UNDO_DELAY_MS)
      return true
    },
    undo() {
      if (!snapshot.pending) return
      clear()
      publish({ pending: false, committing: false, error: null })
    },
    flush: () => execute(true)
  }
}
