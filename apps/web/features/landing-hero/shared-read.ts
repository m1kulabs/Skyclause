// The landing's server reads (the verdict for a window, Bukit Jalil's state, the latest approved call, the grades) ask
// the public API the same question for every visitor and carry no credential, so their answers are shared: one
// upstream request per distinct read while it is in flight, and its answer kept for as long as `ttlMs` says. The page
// itself still renders per request. Server code only.

/** How long a read's answer is kept: a real answer, a part not built yet (501), and anything else that failed. */
export const ANSWER_TTL_MS = 30_000
export const NOT_BUILT_TTL_MS = 60_000
export const FAILURE_TTL_MS = 2_000

interface Entry {
  value?: unknown
  until: number
  pending?: Promise<unknown>
}

export interface SharedReads {
  /** `load`'s answer for `key`: the kept one while fresh, the one in flight, or a new read that later calls share. */
  read<T>(key: string, load: () => Promise<T>, ttlMs: (value: T) => number): Promise<T>
  /** Marks `key` for `ttlMs`, as an answer every later read of it can act on without asking. */
  hold(key: string, ttlMs: number): void
  /** Whether `key` is marked and still fresh. */
  holds(key: string): boolean
}

/** A store of shared answers, at most `limit` of them; `now` is the clock that ages them. */
export function sharedReads(now: () => number = Date.now, limit = 256): SharedReads {
  const entries = new Map<string, Entry>()
  const fresh = (entry: Entry | undefined) => entry !== undefined && !entry.pending && now() < entry.until
  // Query strings name the window, so a visitor could ask for many: expired answers go first, then the oldest.
  const make = (key: string, entry: Entry) => {
    entries.delete(key)
    entries.set(key, entry)
    if (entries.size <= limit) return
    for (const [name, held] of entries) if (!held.pending && now() >= held.until) entries.delete(name)
    for (const [name, held] of entries) {
      if (entries.size <= limit) break
      if (!held.pending) entries.delete(name)
    }
  }
  return {
    read<T>(key: string, load: () => Promise<T>, ttlMs: (value: T) => number): Promise<T> {
      const entry = entries.get(key)
      if (entry?.pending) return entry.pending as Promise<T>
      if (fresh(entry)) return Promise.resolve(entry!.value as T)
      const pending = load().then(
        (value) => {
          make(key, { value, until: now() + ttlMs(value) })
          return value
        },
        (error: unknown) => {
          entries.delete(key)
          throw error
        }
      )
      make(key, { pending, until: 0 })
      return pending
    },
    hold(key: string, ttlMs: number) {
      make(key, { value: true, until: now() + ttlMs })
    },
    holds(key: string) {
      return fresh(entries.get(key))
    }
  }
}

const stores = new WeakMap<object, SharedReads>()

/**
 * The store for answers read through `transport`. The server's `fetch` is patched once at start, so every visitor's
 * page shares one store; a test's stand-in for `fetch` gets its own.
 */
export function sharedReadsFor(transport: object): SharedReads {
  let store = stores.get(transport)
  if (!store) {
    store = sharedReads()
    stores.set(transport, store)
  }
  return store
}
