const listeners = new Set<() => void>()
let currentOrg: string | undefined
/** Null until the stream's snapshot says how many bundles wait: a count seen only since page load is not one. */
let waitingCount: number | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeToWaitingCount(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getWaitingCount(org: string | undefined): number | null {
  return org && org === currentOrg ? waitingCount : null
}

export function startOrgLive(org: string) {
  currentOrg = org
  waitingCount = null
  notify()
}

/** Null again when the stream fails: the last count it gave may no longer hold. */
export function setWaitingCount(org: string, count: number | null) {
  if (org !== currentOrg || count === waitingCount) return
  waitingCount = count
  notify()
}

export function stopOrgLive(org: string) {
  if (org !== currentOrg) return
  currentOrg = undefined
  waitingCount = null
  notify()
}
