import type { Membership, Project } from '@skyclause/contracts'

export type ShellMembership = Pick<Membership, 'org_id' | 'role'> & {
  org_name: string
  org_slug: string
}

export type ShellProject = Pick<Project, 'id' | 'org_id' | 'name' | 'slug'>

/** A read the shell needed that failed: the HTTP status it answered (null when it did not answer) and when. */
export interface ShellReadError {
  status: number | null
  at: string
}

export interface ShellData {
  memberships: ShellMembership[]
  projects: ShellProject[]
  /** The memberships read failed: the shell shows the error, never the no-organisation state. */
  membershipsError?: ShellReadError
  /** Project reads that failed, by organisation ID: that organisation's project list is an error, not n=0. */
  projectsError?: Record<string, ShellReadError>
  /** The memberships read answered 401: no session, so no organisation state either way. */
  signedOut?: boolean
}
