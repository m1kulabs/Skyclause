// #79 §1 `can`: PRD "Roles and permissions", read from docs/PRD.md itself, through every principal kind.
import { readFileSync } from 'node:fs'
import { ROLES, STATEMENTS, type Principal, type Role, type Statement } from '@skyclause/contracts'
import { describe, expect, test } from 'vitest'
import { can } from '../src/can'

const base = { clientName: null } as const
const session = (role: Role | null, isGuest = false): Principal => ({
  ...base,
  kind: 'session',
  via: 'cookie',
  client: 'app',
  accountId: 'account-1',
  sessionId: 'session-1',
  isGuest,
  staff: false,
  orgId: 'org-1',
  role,
  authenticatedAt: new Date()
})
const apiKey = (role: Role, scopes: Array<'read' | 'draft' | 'admin'> = ['read', 'draft', 'admin']): Principal => ({
  ...base,
  kind: 'api_key',
  client: 'api',
  keyId: 'key-1',
  accountId: 'account-1',
  orgId: 'org-1',
  role,
  scopes
})
const oauth = (
  o: { role?: Role | null; projectIds?: string[] | 'all'; shareLinkId?: string | null } = {}
): Principal => ({
  ...base,
  kind: 'oauth',
  client: 'mcp',
  grantId: 'grant-1',
  clientId: 'client-1',
  accountId: 'account-1',
  orgId: 'org-1',
  role: o.role === undefined ? 'owner' : o.role,
  resource: 'mcp',
  projectIds: o.projectIds ?? 'all',
  scopes: ['read', 'draft'],
  shareLinkId: o.shareLinkId ?? null
})
const guestToken: Principal = {
  ...base,
  kind: 'guest_token',
  client: 'playground',
  tokenId: 'token-1',
  accountId: 'account-1',
  orgId: 'org-1',
  scopes: ['read', 'draft']
}
const shareLink = (access: 'view' | 'reviewer'): Principal => ({
  ...base,
  kind: 'share_link',
  client: 'app',
  linkId: 'link-1',
  orgId: 'org-1',
  projectId: 'project-1',
  access
})

/** PRD's matrix: the header's columns and each row's cells, in order. */
function prdMatrix() {
  const prd = readFileSync(new URL('../../../docs/PRD.md', import.meta.url), 'utf8')
  const section = prd.slice(prd.indexOf('## Roles and permissions'), prd.indexOf('## Requirements'))
  const [header, , ...rows] = section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replaceAll('`', ''))
    )
  return { columns: header!.slice(1), rows: rows.map(([action, ...cells]) => ({ action: action!, cells })) }
}

// Each PRD column through the principals that act as it; keys and tokens at full scope and an Owner's role, so only
// the column itself decides. A Subscriber has no account and no principal: subscriber tokens and the public pages
// serve its cells (c-subscribers, d-public-api), never `can`.
const COLUMNS: Record<string, Principal[]> = {
  Owner: [session('owner')],
  Admin: [session('admin')],
  Approver: [session('approver')],
  Editor: [session('editor')],
  Viewer: [session('viewer')],
  Guest: [session('guest', true), guestToken],
  'Share-link reviewer': [shareLink('reviewer'), oauth({ role: null, shareLinkId: 'link-1' })],
  Subscriber: [],
  'API key': [apiKey('owner')],
  'MCP token': [oauth()]
}

describe('every row and column of PRD "Roles and permissions"', () => {
  const { columns, rows } = prdMatrix()

  test('the PRD has the 22 rows and 10 columns STATEMENTS and these principals cover', () => {
    expect(columns).toEqual(Object.keys(COLUMNS))
    expect(rows).toHaveLength(22)
  })

  rows.forEach(({ action, cells }, i) => {
    const statement = STATEMENTS[i]!
    test(`${action} (${statement})`, () => {
      columns.forEach((column, j) => {
        const allowed = !['No', 'Never'].includes(cells[j]!)
        for (const principal of COLUMNS[column]!) {
          expect(can(principal, statement), `${column} "${cells[j]}" as ${principal.kind}`).toBe(allowed)
        }
      })
    })
  })
})

test('the three statements #79 adds: listing.propose for Editors and up, project and org management for Admins', () => {
  const allowed = (statement: Statement) => ROLES.filter((role) => role !== 'guest' && can(session(role), statement))
  expect(allowed('listing.propose')).toEqual(['owner', 'admin', 'approver', 'editor'])
  expect(allowed('project.manage')).toEqual(['owner', 'admin'])
  expect(allowed('org.manage')).toEqual(['owner', 'admin'])
  expect(can(apiKey('owner', ['draft']), 'listing.propose')).toBe(true)
  expect(can(oauth(), 'listing.propose')).toBe(true)
  for (const statement of ['project.manage', 'org.manage'] as const) {
    expect(can(apiKey('owner'), statement)).toBe(false)
    expect(can(oauth(), statement)).toBe(false)
  }
})

test('no API key, MCP token or guest gets bundle.approve, clause_sheet.publish or listing.decide, at any scope or role', () => {
  for (const statement of ['bundle.approve', 'clause_sheet.publish', 'listing.decide'] as const) {
    for (const role of ROLES) {
      expect(can(apiKey(role), statement), `key as ${role}`).toBe(false)
      expect(can(oauth({ role }), statement), `token as ${role}`).toBe(false)
      expect(can(session(role, true), statement), `guest session holding ${role}`).toBe(false)
    }
    expect(can(guestToken, statement)).toBe(false)
  }
})

test('a key or token is capped at its scopes and at its account’s current role', () => {
  // #106: an Editor's admin key passes clause_draft.edit but not sources.manage.
  expect(can(apiKey('editor', ['admin']), 'clause_draft.edit')).toBe(true)
  expect(can(apiKey('editor', ['admin']), 'sources.manage')).toBe(false)
  expect(can(apiKey('viewer', ['draft']), 'window.declare')).toBe(false)
  expect(can(apiKey('owner', ['read']), 'window.declare')).toBe(false)
  expect(can(apiKey('owner', ['read']), 'ledger.view')).toBe(true)
  expect(can(oauth({ role: 'viewer' }), 'window.declare')).toBe(false)
  expect(can(oauth({ role: 'viewer' }), 'project.view')).toBe(true)
})

test('an OAuth grant’s projectIds bound t.projectId, and a share link its own project', () => {
  const bound = oauth({ projectIds: ['project-1'] })
  expect(can(bound, 'project.view', { projectId: 'project-1' })).toBe(true)
  expect(can(bound, 'project.view', { projectId: 'project-2' })).toBe(false)
  expect(can(oauth(), 'project.view', { projectId: 'project-2' })).toBe(true)
  expect(can(shareLink('reviewer'), 'window.declare', { projectId: 'project-1' })).toBe(true)
  expect(can(shareLink('reviewer'), 'window.declare', { projectId: 'project-2' })).toBe(false)
})

test('a view link only views; a reviewer link also declares, asks and requests evidence', () => {
  expect(can(shareLink('view'), 'project.view')).toBe(true)
  expect(can(shareLink('view'), 'ledger.view')).toBe(true)
  for (const statement of ['window.declare', 'run.request', 'evidence.request'] as const) {
    expect(can(shareLink('view'), statement)).toBe(false)
    expect(can(shareLink('reviewer'), statement)).toBe(true)
  }
})

test('an own cell refuses another account’s target', () => {
  expect(can(session('approver'), 'rota.manage', { accountId: 'account-1' })).toBe(true)
  expect(can(session('approver'), 'rota.manage', { accountId: 'account-2' })).toBe(false)
  expect(can(session('admin'), 'rota.manage', { accountId: 'account-2' })).toBe(true)
})

test('devices, system jobs and a session before requireOrg fills its role pass no statement', () => {
  const device: Principal = { ...base, kind: 'device', client: 'api', keyId: 'key-1', orgId: 'org-1', sourceId: 's' }
  const system: Principal = { ...base, kind: 'system', client: 'worker', job: 'batch' }
  for (const statement of STATEMENTS) {
    expect(can(device, statement)).toBe(false)
    expect(can(system, statement)).toBe(false)
    expect(can(session(null), statement)).toBe(false)
    expect(can(session(null, true), statement)).toBe(false)
  }
})
