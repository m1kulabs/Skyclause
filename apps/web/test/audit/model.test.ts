import { expect, test } from 'vitest'
import {
  EMPTY_AUDIT_FILTERS,
  entryMatchesFilters,
  readAuditFilters,
  toApiAuditFilters,
  writeAuditFilters
} from '../../features/audit/model'
import type { AuditEntry } from '../../features/audit/operations'

test('audit filters load from the URL and map to the API contract in MYT', () => {
  const source = new URLSearchParams(
    'actor_id=account-1&action=member.role_changed&target_type=membership&target_id=member-1&project_id=project-1&from=2026-11-01&to=2026-11-08'
  )
  const filters = readAuditFilters(source)

  expect(filters).toEqual({
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'membership',
    target_id: 'member-1',
    project_id: 'project-1',
    from: '2026-11-01',
    to: '2026-11-08'
  })
  expect(toApiAuditFilters(filters)).toEqual({
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'membership',
    target_id: 'member-1',
    project_id: 'project-1',
    from: '2026-11-01T00:00:00+08:00',
    to: '2026-11-08T23:59:59.999+08:00'
  })
})

test('changing audit filters drops a stale cursor and keeps every active filter in the URL', () => {
  const filters = readAuditFilters(
    new URLSearchParams('actor_id=account-1&action=member.role_changed&target_type=membership&target_id=member-1')
  )
  const updated = writeAuditFilters(new URLSearchParams('cursor=page-2&limit=50'), filters)

  expect(updated.get('cursor')).toBeNull()
  expect(updated.get('actor_id')).toBe('account-1')
  expect(updated.get('action')).toBe('member.role_changed')
  expect(updated.get('target_type')).toBe('membership')
  expect(updated.get('target_id')).toBe('member-1')
})

test('rows already on screen that fail the filters now set are the ones to dim', () => {
  const entry = {
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'membership',
    target_id: 'member-1',
    project_id: null,
    created_at: '2026-11-09T18:30:00Z'
  } as unknown as AuditEntry
  const none = EMPTY_AUDIT_FILTERS
  expect(entryMatchesFilters(entry, none)).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, actor_id: 'account-1', target_type: 'membership' })).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, actor_id: 'account-2' })).toBe(false)
  expect(entryMatchesFilters(entry, { ...none, project_id: 'project-1' })).toBe(false)
  // 18:30 UTC on the 9th is 02:30 MYT on the 10th: the range is in MYT days.
  expect(entryMatchesFilters(entry, { ...none, from: '2026-11-10', to: '2026-11-10' })).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, to: '2026-11-09' })).toBe(false)
})
