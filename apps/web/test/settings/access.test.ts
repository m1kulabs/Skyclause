import type { Principal, Role } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import { maySeeSettings } from '../../features/settings/access'

function session(role: Role | null = null, isGuest = false, orgId: string | null = null): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'account-test',
    sessionId: 'session-test',
    authenticatedAt: new Date(),
    staff: false,
    role,
    isGuest,
    orgId
  }
}

test('SET-1 admits signed-in accounts and limits guests to appearance', () => {
  for (const section of ['profile', 'security', 'appearance', 'notifications', 'ai-keys', 'api-keys', 'data']) {
    expect(maySeeSettings(session(), { scope: 'account', section })).toBe(true)
    expect(maySeeSettings(session('guest', true), { scope: 'account', section })).toBe(section === 'appearance')
    expect(maySeeSettings(null, { scope: 'account', section })).toBe(false)
  }
})

test('SET-3/4 deny lower roles, non-sessions and another organisation; only org rota admits Approvers', () => {
  for (const scope of ['organisation', 'project'] as const) {
    for (const role of ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest'] as const) {
      for (const section of ['general', 'rota']) {
        const target = { scope, section, orgId: 'org-test' }
        expect(maySeeSettings(session(role, false, 'org-test'), target)).toBe(
          role === 'owner' ||
            role === 'admin' ||
            (scope === 'organisation' && section === 'rota' && role === 'approver')
        )
        expect(maySeeSettings(session(role, false, 'other-org'), target)).toBe(false)
        expect(maySeeSettings(session(role, true, 'org-test'), target)).toBe(false)
        expect(maySeeSettings(null, target)).toBe(false)
        expect(maySeeSettings({ kind: 'system', job: 'test', client: 'worker', clientName: null }, target)).toBe(false)
      }
    }
  }
})
