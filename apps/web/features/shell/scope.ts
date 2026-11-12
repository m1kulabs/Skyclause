import type { Role } from '@skyclause/contracts'
import { t } from './i18n'
import {
  coreDestinations,
  currentDestination,
  organisationMenuDestinations,
  projectMenuDestinations,
  type Destination,
  type DestinationKey
} from './navigation'
import type { ShellData, ShellMembership, ShellProject, ShellReadError } from './types'

/** Where the person is and what the bar offers there, derived once for the bar, its menus and the phone sheet. */
export interface ShellScope {
  data: ShellData
  /** The organisation the bar's links go to: the URL's, else the first membership's. */
  org?: string
  membership?: ShellMembership
  role?: Role
  /** Every membership is a guest's: the account can't create an organisation or connect an AI client. */
  guestAccount: boolean
  /** The project in the URL. Its links come from the URL, so they work before the project list has been read. */
  projectSlug?: string
  project?: ShellProject
  projects: ShellProject[]
  projectsError?: ShellReadError
  core: Destination[]
  projectMenu: Destination[]
  organisationMenu: Destination[]
  current?: DestinationKey
  orgName: string
  projectName: string
}

export function shellScope(
  data: ShellData,
  pathname: string,
  url: { org?: string; project?: string; tab?: string }
): ShellScope {
  const membership = url.org ? data.memberships.find((item) => item.org_slug === url.org) : data.memberships[0]
  // The URL's organisation, while the memberships say nothing against it: one the person isn't in (a 404) gets no
  // links, and neither does a visitor without a session.
  const org = data.signedOut
    ? undefined
    : membership
      ? membership.org_slug
      : url.org && !data.memberships.length
        ? url.org
        : undefined
  const role = membership?.role
  const projects = membership ? data.projects.filter((item) => item.org_id === membership.org_id) : []
  const project = url.project ? projects.find((item) => item.slug === url.project) : undefined
  const core = org && url.project ? coreDestinations(org, url.project) : []
  const projectMenu = org && url.project ? projectMenuDestinations(org, url.project, role) : []
  const guestAccount = data.memberships.length > 0 && data.memberships.every((item) => item.role === 'guest')
  const organisationMenu = organisationMenuDestinations(org, role, guestAccount)
  // Without the memberships the project list is unknown too: an error, never n=0.
  const projectsError = data.membershipsError ?? (membership ? data.projectsError?.[membership.org_id] : undefined)
  return {
    data,
    org,
    membership,
    role,
    guestAccount,
    projectSlug: url.project,
    project,
    projects,
    projectsError,
    core,
    projectMenu,
    organisationMenu,
    current:
      (url.tab as DestinationKey | undefined) ??
      currentDestination(pathname, [...core, ...projectMenu, ...organisationMenu]),
    orgName:
      membership?.org_name ??
      t(
        data.membershipsError
          ? 'app-shell.organisationsUnavailable'
          : data.memberships.length
            ? 'app-shell.chooseOrganisation'
            : 'app-shell.noOrganisations'
      ),
    projectName:
      project?.name ??
      t(
        projectsError
          ? 'app-shell.projectsUnavailable'
          : projects.length
            ? 'app-shell.chooseProject'
            : 'app-shell.noProjects'
      )
  }
}
