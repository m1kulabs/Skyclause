import { expect, test } from 'vitest'
import { errorMessageKey, maskEmail, roleOptions, roleIsLowering } from '../../features/members/model'

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
