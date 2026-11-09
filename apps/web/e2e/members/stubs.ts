import type { Principal, Role } from '@skyclause/contracts'
import type { Page } from '@playwright/test'
import { membersOperations } from '../../features/members/operations'
import { asPage, stubApi } from '../harness'

export const ownerId = '00000000-0000-4000-8000-000000000001'
export const approverId = '00000000-0000-4000-8000-000000000002'
export const ownerMemberId = '00000000-0000-4000-8000-000000000011'
export const approverMemberId = '00000000-0000-4000-8000-000000000012'

export const ownerMember = {
  id: ownerMemberId,
  org_id: 'test-org',
  account_id: ownerId,
  role: 'owner',
  reads_malay: false,
  name: 'Morgan Owner',
  email: 'morgan@example.test',
  last_active_at: null,
  sign_in_methods: ['email']
}

export const approverMember = {
  id: approverMemberId,
  org_id: 'test-org',
  account_id: approverId,
  role: 'approver',
  reads_malay: false,
  name: 'Aisha Rahman',
  email: 'aisha@example.test',
  last_active_at: '2026-11-09T03:15:00Z',
  sign_in_methods: ['email', 'google']
}

export const defaultTemplates = [
  { template: 'storm_afternoon', local_start: '14:00', local_end: '19:15', condition: 'storm_afternoon' },
  { template: 'surge_night', local_start: '08:00', local_end: '22:00', condition: 'surge_night' }
] as const

export const emptyRota = {
  time_zone: 'Asia/Kuala_Lumpur',
  templates: defaultTemplates,
  shifts: [],
  on_duty: [],
  next_shift: null,
  unstaffed_slots: []
}

export function testPrincipal(role: Role = 'owner'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: ownerId,
    sessionId: 'test-session-members',
    authenticatedAt: new Date('2026-11-09T03:15:00Z'),
    orgId: 'test-org',
    role,
    isGuest: false,
    staff: false
  }
}

export async function prepareSettings(page: Page, section: 'members' | 'rota', role: Role = 'owner') {
  await asPage(page, testPrincipal(role))
  await stubApi(
    page,
    'listMembers',
    { data: [ownerMember, approverMember], next_cursor: null },
    { registry: membersOperations }
  )
  await stubApi(page, 'listInvitations', { data: [], next_cursor: null }, { registry: membersOperations })
  if (section === 'rota') {
    await stubApi(page, 'getRota', emptyRota, { registry: membersOperations, query: { days: '7' } })
  }
}
