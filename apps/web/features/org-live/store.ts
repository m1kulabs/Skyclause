const listeners = new Set<() => void>()
let currentOrg: string | undefined
let approvalsCount = 0

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeToApprovalsCount(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getApprovalsCount(org: string | undefined) {
  return org && org === currentOrg ? approvalsCount : 0
}

export function startOrgLive(org: string) {
  currentOrg = org
  approvalsCount = 0
  notify()
}

export function setApprovalsCount(org: string, count: number) {
  if (org !== currentOrg || count === approvalsCount) return
  approvalsCount = count
  notify()
}

export function stopOrgLive(org: string) {
  if (org !== currentOrg) return
  currentOrg = undefined
  approvalsCount = 0
  notify()
}
