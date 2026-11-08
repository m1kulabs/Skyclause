import { GRANTS, ROLES, STATEMENTS, type Role } from '@skyclause/contracts'
import { createAccessControl, type Role as AccessRole } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access'

// TRD "Sign-in and sessions": one createAccessControl statement per PRD matrix row (`project.view` is resource
// `project`, action `view`), beside the organization plugin's own statements, which its endpoints check.
const matrix: Record<string, string[]> = {}
for (const statement of STATEMENTS) {
  const [resource, action] = statement.split('.') as [string, string]
  ;(matrix[resource] ??= []).push(action)
}

// The api-key plugin checks `apiKey` actions on organisation keys: every role that may create a key holds them, and
// #106's routes narrow them to its own keys and capped scopes.
const API_KEY_ACTIONS = ['create', 'read', 'update', 'delete']

export const ac = createAccessControl({ ...defaultStatements, apiKey: API_KEY_ACTIONS, ...matrix })

/** A role's matrix rows, as the plugin's `resource: actions` statements. */
function granted(role: Role): Record<string, string[]> {
  const rows: Record<string, string[]> = {}
  for (const statement of STATEMENTS) {
    if (!GRANTS[statement][role].allowed) continue
    const [resource, action] = statement.split('.') as [string, string]
    ;(rows[resource] ??= []).push(action)
  }
  if (GRANTS['api_key.create'][role].allowed) rows.apiKey = API_KEY_ACTIONS
  return rows
}

// Owners and Admins keep the plugin's owner and admin rights over members and invitations; the rest are its members.
const PLUGIN_ROLE: Partial<Record<Role, AccessRole>> = { owner: ownerAc, admin: adminAc }

export const roles = Object.fromEntries(
  ROLES.map((role) => [role, ac.newRole({ ...(PLUGIN_ROLE[role] ?? memberAc).statements, ...granted(role) })])
) as Record<Role, AccessRole>
