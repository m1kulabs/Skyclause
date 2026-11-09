import { GRANTS, SCOPE_STATEMENTS, type Can, type GrantSubject, type Scope, type Statement } from '@skyclause/contracts'

type Target = Parameters<Can>[2]

/**
 * A matrix cell, with the qualifier `can` itself enforces: an `own` cell refuses another account's target. The rest are
 * the services': `commons` (Guests are members of the Commons alone), `budgeted` (BudgetGate), `capped` (#106 caps a
 * new key's scopes), `not_to_owner` (#102) and `view` (billing).
 */
function cell(statement: Statement, subject: GrantSubject, accountId: string, t: Target) {
  const grant = GRANTS[statement][subject]
  return grant.allowed && !(grant.qualifiers.includes('own') && t?.accountId !== undefined && t.accountId !== accountId)
}

const scoped = (scopes: readonly Scope[], statement: Statement) =>
  scopes.some((scope) => SCOPE_STATEMENTS[scope].includes(statement))

const inProject = (projectIds: string[] | 'all', t: Target) =>
  projectIds === 'all' || t?.projectId === undefined || projectIds.includes(t.projectId)

/**
 * #79 §1: the only matrix check. A key or token needs its own column's cell and a scope mapping to the statement, and
 * is capped at its account's current role (a link-bound OAuth grant at the share-link reviewer's cell); OAuth
 * `projectIds` and a share link's project bound `t.projectId`. Devices and system jobs hold no statement.
 */
export const can: Can = (principal, statement, t) => {
  switch (principal.kind) {
    case 'session': {
      // A guest takes the Guest column, once requireOrg has filled its role like any session's.
      const subject = principal.role === null ? null : principal.isGuest ? 'guest' : principal.role
      return subject !== null && cell(statement, subject, principal.accountId, t)
    }
    case 'api_key':
      return (
        GRANTS[statement].api_key.allowed &&
        scoped(principal.scopes, statement) &&
        cell(statement, principal.role, principal.accountId, t)
      )
    case 'oauth':
      return (
        GRANTS[statement].mcp_token.allowed &&
        scoped(principal.scopes, statement) &&
        (principal.role
          ? cell(statement, principal.role, principal.accountId, t)
          : GRANTS[statement].share_link_reviewer.allowed) &&
        inProject(principal.projectIds, t)
      )
    case 'guest_token':
      return scoped(principal.scopes, statement) && cell(statement, 'guest', principal.accountId, t)
    case 'share_link':
      return (
        GRANTS[statement].share_link_reviewer.allowed &&
        (principal.access === 'reviewer' || SCOPE_STATEMENTS.read.includes(statement)) &&
        inProject([principal.projectId], t)
      )
    default:
      return false
  }
}
