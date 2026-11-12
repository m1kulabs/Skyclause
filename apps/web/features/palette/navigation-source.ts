import {
  coreDestinations,
  organisationMenuDestinations,
  projectMenuDestinations,
  reviewHref,
  type Destination
} from '../shell/navigation'
import { t } from '../shell/i18n'
import type { PaletteContext, PaletteItem, PaletteSource } from './sources'

/** Every destination the bar and its menus offer, for the same place and role, so the keyboard reaches them all. */
function navigationItems(context: PaletteContext): PaletteItem[] {
  const membership = context.org
    ? context.memberships.find((item) => item.org_slug === context.org)
    : context.memberships[0]
  const org = context.org ?? membership?.org_slug
  const role = membership?.role
  const guestAccount = context.memberships.length > 0 && context.memberships.every((item) => item.role === 'guest')
  const core = org && context.project ? coreDestinations(org, context.project) : []
  const destinations: Destination[] = [
    ...core,
    ...(org && context.project ? projectMenuDestinations(org, context.project, role) : []),
    ...organisationMenuDestinations(org, role, guestAccount)
  ]
  const items: PaletteItem[] = destinations.map((destination) => ({
    id: `go:${destination.key}`,
    label: t(`app-shell.${destination.key}`),
    kind: 'pages',
    suggested: core.includes(destination),
    onSelect: () => context.navigate(destination.href)
  }))
  if (org) {
    items.unshift({
      id: 'go:review',
      label: t('app-shell.review'),
      keywords: ['bundles', 'approve'],
      kind: 'pages',
      suggested: true,
      onSelect: () => context.navigate(reviewHref(org))
    })
  }
  return items
}

export const navigationPaletteSource: PaletteSource = {
  id: 'navigation',
  roles: 'all',
  itemsFor: (context) => (context.projectChoice ? [] : navigationItems(context))
}
