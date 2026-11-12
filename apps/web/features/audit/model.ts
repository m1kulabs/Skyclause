import type { AuditAction } from '@skyclause/contracts'
import { formatDateKey, formatDateTime } from '@skyclause/i18n/format'
import type { AuditEntry } from './operations'

export interface AuditFilterState {
  actor_id: string
  action: string
  target_type: string
  target_id: string
  project_id: string
  from: string
  to: string
}

export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  actor_id: '',
  action: '',
  target_type: '',
  target_id: '',
  project_id: '',
  from: '',
  to: ''
}

const FILTER_KEYS = Object.keys(EMPTY_AUDIT_FILTERS) as Array<keyof AuditFilterState>

export function readAuditFilters(params: URLSearchParams): AuditFilterState {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ''])) as unknown as AuditFilterState
}

export function writeAuditFilters(current: URLSearchParams, filters: AuditFilterState): URLSearchParams {
  const params = new URLSearchParams(current)
  params.delete('cursor')
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value) params.set(key, value)
    else params.delete(key)
  }
  return params
}

export function toApiAuditFilters(filters: AuditFilterState) {
  return {
    actor_id: filters.actor_id || undefined,
    action: filters.action ? (filters.action as AuditAction) : undefined,
    target_type: filters.target_type || undefined,
    target_id: filters.target_id || undefined,
    project_id: filters.project_id || undefined,
    from: filters.from ? `${filters.from}T00:00:00+08:00` : undefined,
    to: filters.to ? `${filters.to}T23:59:59.999+08:00` : undefined
  }
}

export function formatAuditTime(instant: string, locale: 'en' | 'ms' = 'en'): string {
  return formatDateTime(instant, locale)
}

/** The most records a page of the ledger renders; the API's own page size. */
export const AUDIT_PAGE_SIZE = 50

/**
 * Whether a record already on screen satisfies the filters now set. While the answer for new filters is on its way the
 * rows that fail are dimmed, not removed, so nothing jumps; the answer then replaces them.
 */
export function entryMatchesFilters(entry: AuditEntry, filters: AuditFilterState): boolean {
  if (filters.actor_id && entry.actor_id !== filters.actor_id) return false
  if (filters.action && entry.action !== filters.action) return false
  if (filters.target_type && entry.target_type !== filters.target_type) return false
  if (filters.target_id && entry.target_id !== filters.target_id) return false
  if (filters.project_id && entry.project_id !== filters.project_id) return false
  const day = formatDateKey(entry.created_at)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  return true
}
