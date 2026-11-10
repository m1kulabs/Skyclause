import { expect, test } from 'vitest'
import { readAuditFilters, toApiAuditFilters, writeAuditFilters } from '../../features/audit/model'

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
