import { ledgerOperations } from './operations'

export function filtersFromSearch(search: Pick<URLSearchParams, 'get'>) {
  const query: Record<string, string> = {}
  for (const key of ['from', 'to', 'pack', 'mode', 'state'] as const) {
    const value = search.get(key)
    if (value) query[key] = value
  }
  const filters = ledgerOperations.exportLedger.request.query.parse(query)
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('Invalid date range')
  return filters
}

export function ledgerHref(
  path: string,
  search: Pick<URLSearchParams, 'toString'>,
  changes: Record<string, string | null>
) {
  const next = new URLSearchParams(search.toString())
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  return `${path}${next.size ? `?${next}` : ''}`
}

interface Reply {
  leaves_org: boolean
  approved_at: string | null
  replied_at: string | null
  drafted_at?: string | null
  status?: string
}

export function canApproveReply(
  principal: { kind: string; role?: string | null; isGuest?: boolean } | null,
  request: Reply
) {
  return (
    principal?.kind === 'session' &&
    !principal.isGuest &&
    ['owner', 'admin', 'approver'].includes(principal.role ?? '') &&
    request.leaves_org &&
    !!request.drafted_at &&
    !request.approved_at &&
    !request.replied_at
  )
}

export function requestState(request: Reply, guest: boolean) {
  if (guest || request.status === 'not_reviewed') return 'notReviewed'
  if (request.replied_at) return 'replied'
  if (request.leaves_org && !request.approved_at) return 'waiting'
  return 'assembling'
}

// Real table rows can grow for translated copy and long server-provided names.
export function rowOffsets(count: number, heights: ReadonlyMap<number, number>) {
  const offsets = [0]
  for (let index = 0; index < count; index++) offsets.push(offsets[index]! + (heights.get(index) ?? 144))
  return offsets
}

export function measuredWindow(offsets: readonly number[], scrollTop: number, viewport: number) {
  const count = offsets.length - 1
  let low = 0
  let high = count
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid + 1]! < scrollTop) low = mid + 1
    else high = mid
  }
  const start = Math.max(0, low - 3)
  let end = low
  while (end < count && offsets[end]! < scrollTop + viewport) end++
  end = Math.min(count, end + 3)
  return {
    start,
    end,
    before: offsets[start]!,
    visible: offsets[end]! - offsets[start]!,
    after: offsets[count]! - offsets[end]!,
    total: offsets[count]!,
    offsets
  }
}
