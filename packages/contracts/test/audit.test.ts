import { expect, test } from 'vitest'
import { AUDIT_ACTIONS } from '../src/audit'

test('lists each documented audit action once', () => {
  expect(AUDIT_ACTIONS).toEqual([
    'bundle.approved',
    'call.edited',
    'call.rejected',
    'api_key.created',
    'api_key.revoked',
    'ai_key.created',
    'ai_key.revoked',
    'member.role_changed',
    'invite.created',
    'invite.revoked',
    'clause_sheet.published',
    'share_link.created',
    'share_link.revoked',
    'source.bound',
    'source.unbound',
    'sla.changed',
    'export.requested',
    'organisation.deleted',
    'account.deleted',
    'mcp.consent_granted',
    'bundle.escalated',
    'listing.proposed',
    'listing.listed',
    'listing.changed',
    'listing.rejected',
    'listing.cancelled',
    'listing.unlisted',
    'staff.action',
    'flag.changed',
    'mcp.tool_called',
    'bundle.approve_denied',
    'source.probation_passed'
  ])
  expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length)
})
