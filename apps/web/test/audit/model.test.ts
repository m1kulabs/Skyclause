import { AUDIT_ACTIONS } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { expect, test } from 'vitest'
import '../../features/settings/catalogue'
import {
  AUDIT_TARGET_TYPES,
  EMPTY_AUDIT_FILTERS,
  auditActionKey,
  describeActor,
  entryMatchesFilters,
  readAuditFilters,
  targetName,
  targetTypeKey,
  toApiAuditFilters,
  truncatedId,
  writeAuditFilters
} from '../../features/audit/model'
import type { AuditEntry } from '../../features/audit/operations'

test('audit filters load from the URL and map to the API contract in MYT', () => {
  const source = new URLSearchParams(
    'actor_id=account-1&action=member.role_changed&target_type=member&project_id=project-1&from=2026-11-01&to=2026-11-08'
  )
  const filters = readAuditFilters(source)

  expect(filters).toEqual({
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'member',
    project_id: 'project-1',
    from: '2026-11-01',
    to: '2026-11-08'
  })
  expect(toApiAuditFilters(filters)).toEqual({
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'member',
    project_id: 'project-1',
    from: '2026-11-01T00:00:00+08:00',
    to: '2026-11-08T23:59:59.999+08:00'
  })
})

test('changing audit filters drops a stale cursor and keeps every active filter in the URL', () => {
  const filters = readAuditFilters(
    new URLSearchParams('actor_id=account-1&action=member.role_changed&target_type=member')
  )
  const updated = writeAuditFilters(new URLSearchParams('cursor=page-2&limit=50&target_id=old'), filters)

  expect(updated.get('cursor')).toBeNull()
  // A typed object id is no longer a filter: a link that carried one loses it.
  expect(updated.get('target_id')).toBeNull()
  expect(updated.get('actor_id')).toBe('account-1')
  expect(updated.get('action')).toBe('member.role_changed')
  expect(updated.get('target_type')).toBe('member')
})

test('the page a reader is on stays in the URL beside the filters', () => {
  const updated = writeAuditFilters(new URLSearchParams('action=call.edited'), EMPTY_AUDIT_FILTERS, 'page-2')
  expect(updated.get('cursor')).toBe('page-2')
  expect(updated.get('action')).toBeNull()
})

test('rows already on screen that fail the filters now set are the ones to dim', () => {
  const entry = {
    actor_id: 'account-1',
    action: 'member.role_changed',
    target_type: 'member',
    target_id: 'member-1',
    project_id: null,
    created_at: '2026-11-09T18:30:00Z'
  } as unknown as AuditEntry
  const none = EMPTY_AUDIT_FILTERS
  expect(entryMatchesFilters(entry, none)).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, actor_id: 'account-1', target_type: 'member' })).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, actor_id: 'account-2' })).toBe(false)
  expect(entryMatchesFilters(entry, { ...none, project_id: 'project-1' })).toBe(false)
  // 18:30 UTC on the 9th is 02:30 MYT on the 10th: the range is in MYT days.
  expect(entryMatchesFilters(entry, { ...none, from: '2026-11-10', to: '2026-11-10' })).toBe(true)
  expect(entryMatchesFilters(entry, { ...none, to: '2026-11-09' })).toBe(false)
})

test('every audit action has a sentence in English and Malay, and none reads as its slug', () => {
  for (const action of AUDIT_ACTIONS) {
    for (const locale of ['en', 'ms'] as const) {
      const sentence = t(`settings.audit.actions.${auditActionKey(action)}`, {}, locale)
      expect(sentence.length).toBeGreaterThan(8)
      expect(sentence).not.toContain('_')
      expect(sentence).not.toMatch(/[a-z]\.[a-z]/)
    }
  }
  expect(t('settings.audit.actions.member_reads_malay_changed')).toBe('Changed whether a member reads Malay')
})

test('every kind of object the filter offers has a noun in both languages', () => {
  for (const type of AUDIT_TARGET_TYPES) {
    for (const locale of ['en', 'ms'] as const) {
      expect(t(`settings.audit.targets.${targetTypeKey(type)}`, {}, locale).length).toBeGreaterThan(2)
    }
  }
  expect(targetTypeKey('something_new')).toBe('unknown')
})

test('an actor reads as a person by name, a deleted account, or the kind of thing that acted', () => {
  expect(describeActor({ actor_type: 'account', actor_name: 'Aisha Rahman', actor_role: 'admin' })).toEqual({
    kind: 'person',
    name: 'Aisha Rahman',
    role: 'admin'
  })
  expect(describeActor({ actor_type: 'account', actor_name: 'Deleted account', actor_role: null })).toEqual({
    kind: 'deleted'
  })
  expect(describeActor({ actor_type: 'api_key', actor_name: null, actor_role: null })).toEqual({
    kind: 'other',
    type: 'api_key'
  })
  expect(describeActor({ actor_type: 'cron-job', actor_name: null, actor_role: null })).toEqual({
    kind: 'other',
    type: 'system'
  })
})

test('an object is named from the members read, or from a name its record kept, never from its identifier', () => {
  const names = { members: new Map([['member-1', 'Aisha Rahman']]), projects: new Map<string, string>() }
  expect(targetName({ target_type: 'member', target_id: 'member-1', before: null, after: null }, names)).toBe(
    'Aisha Rahman'
  )
  expect(targetName({ target_type: 'member', target_id: 'member-gone', before: null, after: null }, names)).toBeNull()
  expect(
    targetName({ target_type: 'source', target_id: 'source-1', before: null, after: { name: 'JPS gauge' } }, names)
  ).toBe('JPS gauge')
  expect(targetName({ target_type: 'bundle', target_id: 'bundle-1', before: null, after: null }, names)).toBeNull()
})

test('an identifier is cut to its tail for the eye and kept whole for the clipboard', () => {
  expect(truncatedId('018f47a3-b2c1-7c00-8000-000000000193')).toBe('…00000193')
  expect(truncatedId('short')).toBe('short')
})
