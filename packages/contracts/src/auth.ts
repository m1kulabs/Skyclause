// Spec §1 "Principal and middleware" and PRD "Roles and permissions".
export const ROLES = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest'] as const
export type Role = (typeof ROLES)[number]
export const SCOPES = ['read', 'draft', 'admin', 'ingest'] as const
export type Scope = (typeof SCOPES)[number]
export const PRINCIPAL_KINDS = ['session', 'api_key', 'oauth', 'guest_token', 'share_link', 'device', 'system'] as const
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number]

export type Principal = {
  client: 'app' | 'api' | 'cli' | 'mcp' | 'playground' | 'worker'
  clientName: string | null
} & (
  | {
      kind: 'session'
      via: 'cookie' | 'bearer'
      accountId: string
      sessionId: string
      isGuest: boolean
      staff: boolean
      orgId: string | null
      role: Role | null
      authenticatedAt: Date
    }
  | {
      kind: 'api_key'
      keyId: string
      accountId: string
      orgId: string
      role: Role
      scopes: Array<'read' | 'draft' | 'admin'>
    }
  | {
      kind: 'oauth'
      grantId: string
      clientId: string
      accountId: string
      orgId: string
      role: Role | null
      resource: 'api' | 'mcp'
      projectIds: string[] | 'all'
      scopes: Array<'read' | 'draft'>
      shareLinkId: string | null
    }
  | { kind: 'guest_token'; tokenId: string; accountId: string; orgId: string; scopes: Array<'read' | 'draft'> }
  | { kind: 'share_link'; linkId: string; orgId: string; projectId: string; access: 'view' | 'reviewer' }
  | { kind: 'device'; keyId: string; orgId: string; sourceId: string }
  | { kind: 'system'; job: string }
)

// Function types only: f-auth owns the implementations and f-api the registration hooks.
export type ResolvePrincipal = (req: Request, o: { surface: 'v1' | 'api' | 'mcp' }) => Promise<Principal | null>
export type Can = (p: Principal, s: Statement, t?: { projectId?: string; accountId?: string }) => boolean
export type SetPrincipalResolver = (fn: ResolvePrincipal) => void
export type SetPermissionCheck = (fn: Can) => void

export const STATEMENTS = [
  'project.view',
  'ledger.view',
  'window.declare',
  'run.request',
  'evidence.request',
  'clause_draft.edit',
  'clause_sheet.publish',
  'bundle.approve',
  'listing.decide',
  'rota.manage',
  'sources.manage',
  'channels.manage',
  'integrations.manage',
  'ai_keys.manage',
  'api_key.create',
  'members.manage',
  'share_link.create',
  'public_pages.edit',
  'org.export',
  'audit.view',
  'billing.manage',
  'org.delete',
  'listing.propose',
  'project.manage',
  'org.manage'
] as const
export type Statement = (typeof STATEMENTS)[number]
export const GRANT_SUBJECTS = [
  'owner',
  'admin',
  'approver',
  'editor',
  'viewer',
  'guest',
  'share_link_reviewer',
  'subscriber',
  'api_key',
  'mcp_token'
] as const
export type GrantSubject = (typeof GRANT_SUBJECTS)[number]
export const GRANT_QUALIFIERS = [
  'own',
  'capped',
  'not_to_owner',
  'commons',
  'shared_project',
  'budgeted',
  'view',
  'never'
] as const
export type GrantQualifier = (typeof GRANT_QUALIFIERS)[number]

export interface Grant {
  // Preserve the cell's wording, including restrictions such as 'By declaring a window'.
  label: string
  allowed: boolean
  qualifiers: readonly GrantQualifier[]
  scope?: Scope
}

// Every PRD matrix cell is explicit. can() enforces qualifiers and the target.
export const GRANTS: Record<Statement, Record<GrantSubject, Grant>> = {
  'project.view': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'Yes', allowed: true, qualifiers: [] },
    guest: { label: 'Commons', allowed: true, qualifiers: ['commons'] },
    share_link_reviewer: { label: 'Shared project', allowed: true, qualifiers: ['shared_project'] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'read', allowed: true, qualifiers: [], scope: 'read' },
    mcp_token: { label: 'read', allowed: true, qualifiers: [], scope: 'read' }
  },
  'ledger.view': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'Yes', allowed: true, qualifiers: [] },
    guest: { label: 'Commons', allowed: true, qualifiers: ['commons'] },
    share_link_reviewer: { label: 'Shared project', allowed: true, qualifiers: ['shared_project'] },
    subscriber: { label: 'Public ledger', allowed: true, qualifiers: [] },
    api_key: { label: 'read', allowed: true, qualifiers: [], scope: 'read' },
    mcp_token: { label: 'read', allowed: true, qualifiers: [], scope: 'read' }
  },
  'window.declare': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'Guest window', allowed: true, qualifiers: ['commons'] },
    share_link_reviewer: { label: 'Reviewer link', allowed: true, qualifiers: ['shared_project'] },
    subscriber: { label: 'Own, by form', allowed: true, qualifiers: ['own'] },
    api_key: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' },
    mcp_token: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' }
  },
  'run.request': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'Budgeted', allowed: true, qualifiers: ['budgeted'] },
    share_link_reviewer: { label: 'By declaring a window', allowed: true, qualifiers: ['shared_project'] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' },
    mcp_token: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' }
  },
  'evidence.request': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'Yes', allowed: true, qualifiers: [] },
    guest: { label: 'Budgeted, in-app', allowed: true, qualifiers: ['budgeted'] },
    share_link_reviewer: { label: 'Reviewer link', allowed: true, qualifiers: ['shared_project'] },
    subscriber: { label: 'By email', allowed: true, qualifiers: [] },
    api_key: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' },
    mcp_token: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' }
  },
  'clause_draft.edit': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'admin', allowed: true, qualifiers: [], scope: 'admin' },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'clause_sheet.publish': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'bundle.approve': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'Never', allowed: false, qualifiers: ['never'] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'Never', allowed: false, qualifiers: ['never'] },
    mcp_token: { label: 'Never', allowed: false, qualifiers: ['never'] }
  },
  'listing.decide': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'Never', allowed: false, qualifiers: ['never'] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'Never', allowed: false, qualifiers: ['never'] },
    mcp_token: { label: 'Never', allowed: false, qualifiers: ['never'] }
  },
  'rota.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Own shifts', allowed: true, qualifiers: ['own'] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'sources.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'admin', allowed: true, qualifiers: [], scope: 'admin' },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'channels.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'Own preferences', allowed: true, qualifiers: ['own'] },
    api_key: { label: 'admin', allowed: true, qualifiers: [], scope: 'admin' },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'integrations.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'admin', allowed: true, qualifiers: [], scope: 'admin' },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'ai_keys.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'api_key.create': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Own, capped', allowed: true, qualifiers: ['own', 'capped'] },
    editor: { label: 'Own, capped', allowed: true, qualifiers: ['own', 'capped'] },
    viewer: { label: 'Own, read', allowed: true, qualifiers: ['own'] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'members.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes, not to Owner', allowed: true, qualifiers: ['not_to_owner'] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'share_link.create': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'public_pages.edit': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'org.export': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'Own data', allowed: true, qualifiers: ['own'] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'audit.view': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'billing.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'View', allowed: true, qualifiers: ['view'] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'org.delete': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'No', allowed: false, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'Never', allowed: false, qualifiers: ['never'] },
    mcp_token: { label: 'Never', allowed: false, qualifiers: ['never'] }
  },
  'listing.propose': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'Yes', allowed: true, qualifiers: [] },
    editor: { label: 'Yes', allowed: true, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' },
    mcp_token: { label: 'draft', allowed: true, qualifiers: [], scope: 'draft' }
  },
  'project.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  },
  'org.manage': {
    owner: { label: 'Yes', allowed: true, qualifiers: [] },
    admin: { label: 'Yes', allowed: true, qualifiers: [] },
    approver: { label: 'No', allowed: false, qualifiers: [] },
    editor: { label: 'No', allowed: false, qualifiers: [] },
    viewer: { label: 'No', allowed: false, qualifiers: [] },
    guest: { label: 'No', allowed: false, qualifiers: [] },
    share_link_reviewer: { label: 'No', allowed: false, qualifiers: [] },
    subscriber: { label: 'No', allowed: false, qualifiers: [] },
    api_key: { label: 'No', allowed: false, qualifiers: [] },
    mcp_token: { label: 'No', allowed: false, qualifiers: [] }
  }
}

// One map for API keys and MCP tokens. MCP admits read/draft only (Spec §1).
// Device ingest is a separate principal, not a matrix statement.
export const SCOPE_STATEMENTS: Record<Scope, readonly Statement[]> = {
  read: ['project.view', 'ledger.view'],
  draft: ['window.declare', 'run.request', 'evidence.request', 'listing.propose'],
  admin: ['clause_draft.edit', 'sources.manage', 'channels.manage', 'integrations.manage'],
  ingest: []
}
