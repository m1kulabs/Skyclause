import type { ShellData, ShellReadError } from './types'

/** The cookie the planted shell route, and the app layout in the test runtime only, read their shell data from. */
export const SHELL_HARNESS_COOKIE = 'skyclause-test-shell'

const roles = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']

function readError(value: unknown): value is ShellReadError {
  const error = value as ShellReadError
  return (
    typeof value === 'object' &&
    value !== null &&
    (error.status === null || typeof error.status === 'number') &&
    typeof error.at === 'string'
  )
}

/** Used only in the test runtime; production has no route accepting shell data. */
export function shellHarnessData(value?: string): ShellData {
  if (!value) return { memberships: [], projects: [] }
  try {
    const data: ShellData = JSON.parse(decodeURIComponent(value))
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
    if (data.membershipsError !== undefined && !readError(data.membershipsError)) throw new Error('Invalid error')
    if (data.projectsError !== undefined && !Object.values(data.projectsError).every(readError))
      throw new Error('Invalid error')
    return {
      memberships: data.memberships,
      projects: data.projects,
      ...(data.membershipsError ? { membershipsError: data.membershipsError } : {}),
      ...(data.projectsError ? { projectsError: data.projectsError } : {}),
      ...(data.signedOut === true ? { signedOut: true } : {})
    }
  } catch {
    return { memberships: [], projects: [] }
  }
}
