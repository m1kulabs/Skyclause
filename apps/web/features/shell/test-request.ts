import type { ShellData } from './types'

/** Used only by the planted route; production has no route accepting shell data. */
export function shellHarnessData(value?: string): ShellData {
  if (!value) return { memberships: [], projects: [] }
  try {
    const data: ShellData = JSON.parse(decodeURIComponent(value))
    const roles = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']
    if (!Array.isArray(data.memberships) || !Array.isArray(data.projects)) throw new Error('Invalid shell request')
    if (
      !data.memberships.every(
        (item) =>
          typeof item.org_id === 'string' &&
          typeof item.org_name === 'string' &&
          typeof item.org_slug === 'string' &&
          roles.includes(item.role)
      )
    )
      throw new Error('Invalid membership')
    if (
      !data.projects.every(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.org_id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.slug === 'string'
      )
    )
      throw new Error('Invalid project')
    return { ...data, sidebarCollapsed: data.sidebarCollapsed === true }
  } catch {
    return { memberships: [], projects: [] }
  }
}
