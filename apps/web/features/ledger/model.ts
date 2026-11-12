import type { LedgerKind } from '@skyclause/contracts'
import { ledgerOperations } from './operations'

/** The kinds of entry the Show filter groups; it dims the others in place instead of removing them. */
export const KIND_GROUPS = {
  calls: ['call_approved', 'call_edited', 'call_rejected', 'call_expired', 'call_sent'],
  grades: ['grade', 'night_graded'],
  listings: ['listing_listed', 'listing_changed', 'listing_cancelled'],
  clauses: ['clause_version'],
  windows: ['window_cancelled'],
  evidence: ['evidence_replied', 'crowd_reply'],
  corrections: ['correction']
} as const satisfies Record<string, readonly LedgerKind[]>
export type KindGroup = keyof typeof KIND_GROUPS

export function kindGroupFromSearch(search: Pick<URLSearchParams, 'get'>): KindGroup | null {
  const value = search.get('kind')
  return value && value in KIND_GROUPS ? (value as KindGroup) : null
}

export function matchesKind(kind: LedgerKind, group: KindGroup | null) {
  return !group || (KIND_GROUPS[group] as readonly LedgerKind[]).includes(kind)
}

/** Entries the platform writes by itself: the nightly grading, expiry and notice delivery. */
const PLATFORM_KINDS: readonly LedgerKind[] = ['grade', 'night_graded', 'call_expired', 'call_sent']

/** Who or what acted: the approver's role, the platform for its own runs, otherwise nothing recorded. */
export function actorOf(row: { kind: LedgerKind; approver_role: string | null }) {
  if (row.approver_role) return { role: row.approver_role }
  return PLATFORM_KINDS.includes(row.kind) ? { platform: true as const } : null
}

/** Whole minutes between two instants, or null when either is missing. */
export function minutesBetween(from?: string | null, to?: string | null) {
  return from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 60000) : null
}

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

/** Which filter fields hold the problem: a value the contract refuses, or both dates when the range runs backwards. */
export function invalidFilters(search: Pick<URLSearchParams, 'get'>): Set<string> {
  const keys = new Set<string>()
  for (const key of ['from', 'to', 'pack', 'mode', 'state'] as const) {
    const value = search.get(key)
    if (value && !ledgerOperations.exportLedger.request.query.safeParse({ [key]: value }).success) keys.add(key)
  }
  const from = search.get('from')
  const to = search.get('to')
  if (!keys.size && from && to && from > to) {
    keys.add('from')
    keys.add('to')
  }
  return keys
}

/** The entry a link points at: `?entry=` names it; `?call=` names a call, whose approval (else first) entry it is. */
export function targetEntry(
  rows: ReadonlyArray<{ id: string; kind: LedgerKind; refs: Record<string, string>; call?: { id: string } | null }>,
  entry: string | null,
  call: string | null
): string | null {
  if (entry) return rows.some((row) => row.id === entry) ? entry : null
  if (!call) return null
  const matches = rows.filter((row) => row.refs.call_id === call || row.call?.id === call)
  return (matches.find((row) => row.kind === 'call_approved') ?? matches[0])?.id ?? null
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

/** A record row before it is measured: the 44px pitch plus its two-line time cell. */
export const ESTIMATED_ROW = 56

// Real table rows can grow for translated copy and long server-provided names.
export function rowOffsets(count: number, heights: ReadonlyMap<number, number>) {
  const offsets = [0]
  for (let index = 0; index < count; index++) offsets.push(offsets[index]! + (heights.get(index) ?? ESTIMATED_ROW))
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
