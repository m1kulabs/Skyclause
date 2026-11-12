import type { Role } from '@skyclause/contracts'

export interface PaletteMembership {
  account_id: string
  org_id: string
  org_name: string
  org_slug: string
  role: Role
}

export interface PaletteProject {
  id: string
  org_id: string
  org_name: string
  org_slug: string
  name: string
  slug: string
  role: Role
  account_id: string
}

export interface PaletteContext {
  pathname: string
  /** The route's organisation and project, from the URL's parameters (not the path's first segments). */
  org?: string
  project?: string
  memberships: readonly PaletteMembership[]
  projects: readonly PaletteProject[]
  query: string
  projectQuery: string
  projectChoice: 'window' | 'ledger' | null
  changeTheme: (theme: 'light' | 'dark' | 'system') => void
  chooseProject: (purpose: 'window' | 'ledger') => void
  navigate: (href: string) => void
}

/** How the palette groups an item: the place it goes or the kind of thing it does. */
export type PaletteKind = 'actions' | 'pages' | 'places' | 'appearance' | 'results'

export interface PaletteItem {
  id: string
  /** A translated label supplied by the source. */
  label: string
  keywords?: string[]
  translateNo?: boolean
  keepOpen?: boolean
  /** The group it shows in. */
  kind: PaletteKind
  /** Offered under Suggestions while the search is empty. */
  suggested?: boolean
  onSelect: () => void
}

export interface PaletteSource {
  id: string
  roles: readonly Role[] | 'all'
  items?: readonly PaletteItem[]
  load?: (signal: AbortSignal) => Promise<Pick<PaletteContext, 'memberships' | 'projects'>>
  itemsFor?: (context: PaletteContext) => readonly PaletteItem[]
  search?: (query: string, context: PaletteContext, signal: AbortSignal) => Promise<PaletteItem[]>
}

import { dashboardPaletteSource } from '../dashboard/palette-source'
import { navigationPaletteSource } from './navigation-source'

export const paletteSources: readonly PaletteSource[] = [dashboardPaletteSource, navigationPaletteSource]

export function sourcesForRole(sources: readonly PaletteSource[], role: Role | null): PaletteSource[] {
  return sources.filter((source) => source.roles === 'all' || (role !== null && source.roles.includes(role)))
}
