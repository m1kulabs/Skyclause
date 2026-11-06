import type { Membership, Project } from '@skyclause/contracts'

export type ShellMembership = Pick<Membership, 'org_id' | 'role'> & {
  org_name: string
  org_slug: string
}

export type ShellProject = Pick<Project, 'id' | 'org_id' | 'name' | 'slug'>

export interface ShellData {
  memberships: ShellMembership[]
  projects: ShellProject[]
  sidebarCollapsed?: boolean
}
