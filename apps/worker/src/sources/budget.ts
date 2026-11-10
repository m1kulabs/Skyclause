import { RateLimitedError, type ApiFamily } from '@skyclause/sources'
import { decodeObject, encodeObject, hasCode } from './storage'
import type { SourceClock, SourceObjectStore } from './types'

/** Four distinct physical requests per family in the trailing minute, shared by jobs and probes. */
export async function takeSourceBudget(
  store: SourceObjectStore,
  family: ApiFamily,
  requestId: string,
  clock: SourceClock
): Promise<void> {
  const path = `control/budgets/${family}.json`
  const deadline = clock.monotonic() + 20000
  const timer = new AbortController()
  const checkDeadline = () => {
    if (clock.monotonic() >= deadline) throw new RateLimitedError(family)
  }
  const reserve = async () => {
    for (;;) {
      checkDeadline()
      const current = await store.read(path)
      checkDeadline()
      const now = clock.now().getTime()
      const requests = (
        current
          ? decodeObject<{ requests: Array<{ requestId: string; startedAt: number }> }>(current.body).requests
          : []
      ).filter((request) => request.startedAt > now - 60000 && request.startedAt <= now)
      if (requests.some((request) => request.requestId === requestId)) return
      if (requests.length < 4) {
        try {
          await store.write(
            path,
            encodeObject({ requests: [...requests, { requestId, startedAt: now }] }),
            current?.generation ?? '0'
          )
          checkDeadline()
          return
        } catch (error) {
          if (!hasCode(error, 412)) throw error
        }
      } else {
        await clock.sleep(
          Math.min(
            deadline - clock.monotonic(),
            Math.min(...requests.map((request) => request.startedAt)) + 60000 - now
          ),
          timer.signal
        )
      }
    }
  }
  const timeout = clock.sleep(20000, timer.signal).then(() => {
    if (!timer.signal.aborted) throw new RateLimitedError(family)
    return new Promise<never>(() => {})
  })
  // GCS itself can stall. A late write retains a conservative reservation, but never authorizes HTTP.
  try {
    await Promise.race([reserve(), timeout])
  } finally {
    timer.abort()
  }
}
