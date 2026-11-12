import { expect, test } from 'vitest'
import { activityAge, errorMessageKey, maskEmail, roleOptions, roleIsLowering } from '../../features/members/model'

test('member role options never offer direct ownership grant and detect demotions', () => {
  expect(roleOptions('admin')).not.toContain('owner')
  expect(roleOptions('owner')).not.toContain('owner')
  expect(roleIsLowering('approver', 'editor')).toBe(true)
  expect(roleIsLowering('editor', 'approver')).toBe(false)
})

test.each([
  ['last-owner', 'members.last_owner'],
  ['role-not-grantable', 'members.role_not_grantable'],
  ['invite-withdrawn', 'members.invite_withdrawn'],
  ['link-expired', 'members.invite_expired']
])('maps the %s operation problem to inline copy', (code, key) => {
  expect(errorMessageKey({ body: { type: `https://example.test/problems/${code}` } }, 'fallback')).toBe(key)
})

test('masked invite addresses hide all but the first local-part character', () => {
  expect(maskEmail('aisha.rahman@example.test')).toBe('a***@example.test')
})

test('a member’s last activity is told in words: minutes, hours, days, then a date', () => {
  const now = Date.parse('2026-11-12T08:00:00Z')
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
  expect(activityAge(ago(0), now)).toEqual({ unit: 'now', value: 0 })
  expect(activityAge(ago(12), now)).toEqual({ unit: 'minutes', value: 12 })
  expect(activityAge(ago(90), now)).toEqual({ unit: 'minutes', value: 90 })
  expect(activityAge(ago(180), now)).toEqual({ unit: 'hours', value: 3 })
  expect(activityAge(ago(60 * 24 * 3), now)).toEqual({ unit: 'days', value: 3 })
  expect(activityAge(ago(60 * 24 * 45), now).unit).toBe('date')
})
