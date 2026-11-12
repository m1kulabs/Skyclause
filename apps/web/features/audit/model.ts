import { AUDIT_ACTIONS, type AuditAction } from '@skyclause/contracts'
import { formatDateKey, formatDateTime } from '@skyclause/i18n/format'
import type { AuditEntry } from './operations'

export interface AuditFilterState {
  actor_id: string
  action: string
  target_type: string
  project_id: string
  from: string
  to: string
}

export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  actor_id: '',
  action: '',
  target_type: '',
  project_id: '',
  from: '',
  to: ''
}

const FILTER_KEYS = Object.keys(EMPTY_AUDIT_FILTERS) as Array<keyof AuditFilterState>

export function readAuditFilters(params: URLSearchParams): AuditFilterState {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ''])) as unknown as AuditFilterState
}

/** The filters and the page's cursor as the URL holds them: a filter change starts again at the first page. */
export function writeAuditFilters(current: URLSearchParams, filters: AuditFilterState, cursor?: string | null) {
  const params = new URLSearchParams(current)
  params.delete('cursor')
  params.delete('target_id')
  if (cursor) params.set('cursor', cursor)
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

/** How long the filters rest before the log is read again, so typing a date does not read it once per digit. */
export const AUDIT_FILTER_DELAY_MS = 300

/**
 * Whether a record already on screen satisfies the filters now set. While the answer for new filters is on its way the
 * rows that fail are dimmed, not removed, so nothing jumps; the answer then replaces them.
 */
export function entryMatchesFilters(entry: AuditEntry, filters: AuditFilterState): boolean {
  if (filters.actor_id && entry.actor_id !== filters.actor_id) return false
  if (filters.action && entry.action !== filters.action) return false
  if (filters.target_type && entry.target_type !== filters.target_type) return false
  if (filters.project_id && entry.project_id !== filters.project_id) return false
  const day = formatDateKey(entry.created_at)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  return true
}

/** The catalogue key of an action's sentence: a slug's dot is a path separator there, so it becomes an underscore. */
export function auditActionKey(action: string): string {
  return action.replace('.', '_')
}

/** The actions a person can filter by, in the order the contract lists them. */
export const AUDIT_ACTION_OPTIONS: readonly AuditAction[] = AUDIT_ACTIONS

/** The kinds of object the log records, as the filter offers them (each has a noun in the catalogue). */
export const AUDIT_TARGET_TYPES = [
  'member',
  'invitation',
  'ownership_transfer',
  'window',
  'night',
  'call',
  'bundle',
  'source',
  'project_pack',
  'api_key',
  'ai_key',
  'export',
  'subscriber',
  'share_link',
  'clause_sheet',
  'review_item',
  'evidence_request',
  'crowd_reply',
  'feature_flag',
  'pilot_archive',
  'mcp_tool'
] as const

/** Targets and actor types that have a noun in the catalogue; anything else reads as a plain "Record". */
const KNOWN_TARGETS = new Set<string>([
  ...AUDIT_TARGET_TYPES,
  'membership',
  'organisation',
  'account',
  'mcp_client',
  'evidence_reply',
  'audit_log',
  'listing',
  'operation'
])
const KNOWN_ACTORS = new Set(['api_key', 'oauth_client', 'guest_token', 'share_link', 'device', 'system'])

export function targetTypeKey(type: string): string {
  return KNOWN_TARGETS.has(type) ? type : 'unknown'
}

/** The server's own name for an account that no longer exists: shown in words the catalogue holds. */
export const DELETED_ACCOUNT_NAME = 'Deleted account'

export type AuditActor =
  { kind: 'person'; name: string; role: string | null } | { kind: 'deleted' } | { kind: 'other'; type: string }

/** Who did it: a person by name and role, or the kind of thing that acted, never an identifier. */
export function describeActor(entry: Pick<AuditEntry, 'actor_type' | 'actor_name' | 'actor_role'>): AuditActor {
  if (entry.actor_name === DELETED_ACCOUNT_NAME) return { kind: 'deleted' }
  if (entry.actor_name) return { kind: 'person', name: entry.actor_name, role: entry.actor_role }
  if (entry.actor_type === 'account') return { kind: 'deleted' }
  return { kind: 'other', type: KNOWN_ACTORS.has(entry.actor_type) ? entry.actor_type : 'system' }
}

export interface AuditNames {
  /** Member id to name. */
  members: ReadonlyMap<string, string>
  /** Project id to name. */
  projects: ReadonlyMap<string, string>
}

/**
 * The name of what an entry acted on, when something the page already read holds it: a member by the members list,
 * anything else by a `name` or `title` the record kept in its before and after. Null when nothing does.
 */
export function targetName(
  entry: Pick<AuditEntry, 'target_type' | 'target_id' | 'before' | 'after'>,
  names: AuditNames
) {
  if (entry.target_type === 'member' || entry.target_type === 'membership') {
    return names.members.get(entry.target_id) ?? null
  }
  for (const side of [entry.after, entry.before]) {
    if (side && typeof side === 'object' && !Array.isArray(side)) {
      for (const field of ['name', 'title']) {
        const value = (side as Record<string, unknown>)[field]
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
  }
  return null
}

/** The end of an identifier, enough to match it against another record: the whole identifier stays behind a copy control. */
export function truncatedId(id: string, length = 8): string {
  return id.length > length ? `…${id.slice(-length)}` : id
}
