import { RateLimitedError, type ApiFamily } from '@skyclause/sources'
import { decodeObject, encodeObject, hasCode } from './storage'
import type { SourceClock, SourceObjectStore } from './types'

// A permit may start transport until its original 20-second admission deadline. Retaining its
// reservation for 80 seconds therefore protects every permitted physical start for at least 60.
// The ceiling is four reservations per 80 seconds; deadline/tick alignment can defer calls further.
// This conservative cost avoids a second charge/CAS while preserving the original admission deadline.
export const SOURCE_ADMISSION_MS = 20000
export const SOURCE_BUDGET_HOLD_MS = 60000 + SOURCE_ADMISSION_MS
/** At most four physical starts per family in any trailing minute, shared by jobs and probes. */
export async function takeSourceBudget(
  store: SourceObjectStore,
  family: ApiFamily,
  requestId: string,
  clock: SourceClock
): Promise<void> {
  const path = `control/budgets/${family}.json`
  const deadline = clock.monotonic() + SOURCE_ADMISSION_MS
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
      ).filter((request) => request.startedAt > now - SOURCE_BUDGET_HOLD_MS)
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
            Math.min(...requests.map((request) => request.startedAt)) + SOURCE_BUDGET_HOLD_MS - now
          ),
          timer.signal
        )
      }
    }
  }
  const timeout = clock.sleep(SOURCE_ADMISSION_MS, timer.signal).then(() => {
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
