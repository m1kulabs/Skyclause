import { can } from '@skyclause/auth/can'
import type { Principal, Role } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import type { PaletteContext, PaletteItem, PaletteMembership, PaletteProject, PaletteSource } from '../palette/sources'
import { t } from '../palette/catalogue'

function principalFor(membership: PaletteMembership): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: membership.account_id,
    sessionId: 'palette-membership',
    authenticatedAt: new Date(0),
    orgId: membership.org_id,
    role: membership.role,
    isGuest: membership.role === 'guest',
    staff: false
  }
}

function membershipCan(
  membership: PaletteMembership,
  statement: 'project.view' | 'window.declare' | 'ledger.view',
  projectId?: string
) {
  return can(principalFor(membership), statement, projectId ? { projectId } : undefined)
}

function membershipForProject(context: PaletteContext, project: PaletteProject): PaletteMembership | undefined {
  return context.memberships.find((membership) => membership.org_id === project.org_id)
}

/** The route's organisation and project; `/new`, `/connect` and `/account/*` have neither, whatever their path. */
function scope(context: PaletteContext) {
  const { org: orgSlug, project: projectSlug } = context
  const membership = orgSlug ? context.memberships.find((item) => item.org_slug === orgSlug) : undefined
  const project = projectSlug
    ? context.projects.find((item) => item.org_slug === orgSlug && item.slug === projectSlug)
    : undefined
  return { orgSlug: membership ? orgSlug : undefined, membership, project }
}

function allowedProjects(context: PaletteContext, purpose: 'window' | 'ledger') {
  const current = scope(context)
  return context.projects.filter((project) => {
    if (current.orgSlug && project.org_slug !== current.orgSlug) return false
    const membership = membershipForProject(context, project)
    if (!membership || !membershipCan(membership, 'project.view', project.id)) return false
    return purpose === 'window'
      ? membershipCan(membership, 'window.declare', project.id)
      : membershipCan(membership, 'ledger.view', project.id)
  })
}

function ledgerHref(project: PaletteProject, query: string) {
  const root = `/${encodeURIComponent(project.org_slug)}/${encodeURIComponent(project.slug)}/ledger`
  return query ? `${root}?q=${encodeURIComponent(query)}` : root
}

function actionItems(context: PaletteContext): PaletteItem[] {
  if (context.projectChoice) {
    const purpose = context.projectChoice
    return allowedProjects(context, purpose).map((project) => ({
      id: `choose-${purpose}:${project.id}`,
      label:
        purpose === 'window'
          ? t('palette.declare_window_for', { name: project.name })
          : t('palette.open_project', { name: project.name }),
      keywords: [project.id, project.slug, project.org_slug],
      kind: 'places',
      onSelect: () =>
        context.navigate(
          purpose === 'window'
            ? `/${encodeURIComponent(project.org_slug)}/${encodeURIComponent(project.slug)}/windows?declare=window`
            : ledgerHref(project, context.projectQuery)
        )
    }))
  }

  const items: PaletteItem[] = []
  const current = scope(context)
  for (const membership of context.memberships) {
    if (!membershipCan(membership, 'project.view')) continue
    items.push({
      id: `organisation:${membership.org_id}`,
      label: t('palette.open_organisation', { name: membership.org_name }),
      keywords: [membership.org_id, membership.org_slug, membership.org_name],
      kind: 'places',
      onSelect: () => context.navigate(`/${encodeURIComponent(membership.org_slug)}`)
    })
  }
  for (const project of context.projects) {
    const membership = membershipForProject(context, project)
    if (!membership || !membershipCan(membership, 'project.view', project.id)) continue
    items.push({
      id: `project:${project.id}`,
      label: t('palette.open_project', { name: project.name }),
      keywords: [project.id, project.slug, project.org_slug],
      kind: 'places',
      onSelect: () => context.navigate(`/${encodeURIComponent(project.org_slug)}/${encodeURIComponent(project.slug)}`)
    })
  }

  if (
    current.project &&
    current.membership &&
    membershipCan(current.membership, 'window.declare', current.project.id)
  ) {
    items.push({
      id: 'declare-window',
      label: t('palette.declare_window'),
      kind: 'actions',
      suggested: true,
      keywords: ['window', current.project.id, current.project.slug],
      onSelect: () =>
        context.navigate(
          `/${encodeURIComponent(current.project!.org_slug)}/${encodeURIComponent(current.project!.slug)}/windows?declare=window`
        )
    })
  } else if (allowedProjects(context, 'window').length) {
    items.push({
      id: 'declare-window',
      label: t('palette.declare_window'),
      kind: 'actions',
      suggested: true,
      keywords: ['window', 'project'],
      keepOpen: true,
      onSelect: () => context.chooseProject('window')
    })
  }

  if (current.project && current.membership && membershipCan(current.membership, 'ledger.view', current.project.id)) {
    items.push({
      id: 'search-ledger',
      label: t('palette.search_ledger'),
      kind: 'actions',
      suggested: true,
      keywords: ['ledger', current.project.id, current.project.slug],
      onSelect: () => context.navigate(ledgerHref(current.project!, context.query))
    })
  } else if (allowedProjects(context, 'ledger').length) {
    items.push({
      id: 'search-ledger',
      label: t('palette.search_ledger'),
      kind: 'actions',
      suggested: true,
      keywords: ['ledger', 'project'],
      keepOpen: true,
      onSelect: () => context.chooseProject('ledger')
    })
  }
  return items
}

async function load(signal: AbortSignal) {
  const { allPages, paletteMemberApi, paletteProjectApi } = await import('./operations')
  const memberships = await allPages((cursor) =>
    paletteMemberApi('listMyMemberships', { query: { limit: 200, cursor }, signal, cache: 'no-store' })
  )
  const visible = memberships.filter((membership) => membershipCan(membership, 'project.view'))
  const projects = (
    await Promise.all(
      visible.map(async (membership) => {
        const data = await allPages((cursor) =>
          paletteProjectApi('listProjects', {
            org: membership.org_slug,
            query: { limit: 200, cursor },
            signal,
            cache: 'no-store'
          })
        )
        return data
          .filter((project) => project.org_id === membership.org_id)
          .filter((project) => membershipCan(membership, 'project.view', project.id))
          .map((project) => ({
            id: project.id,
            org_id: project.org_id,
            org_name: membership.org_name,
            org_slug: membership.org_slug,
            name: project.name,
            slug: project.slug,
            role: membership.role,
            account_id: membership.account_id
          }))
      })
    )
  ).flat()
  return {
    memberships: visible.map((membership) => ({
      account_id: membership.account_id,
      org_id: membership.org_id,
      org_name: membership.org_name,
      org_slug: membership.org_slug,
      role: membership.role as Role
    })),
    projects
  }
}

async function search(query: string, context: PaletteContext, signal: AbortSignal): Promise<PaletteItem[]> {
  const { allPages, paletteSearchApi } = await import('./operations')
  const current = scope(context)
  const memberships = current.membership
    ? [current.membership]
    : context.memberships.filter((membership) => membershipCan(membership, 'project.view'))
  const pages = await Promise.all(
    memberships.map((membership) =>
      allPages((cursor) =>
        paletteSearchApi('searchOrganisation', {
          org: membership.org_slug,
          query: { q: query, limit: 20, cursor },
          signal,
          cache: 'no-store'
        })
      )
        // An organisation whose search is not available yet (501) adds no results; the palette's own commands and
        // destinations still match what was typed. Any other failure is a failed search, shown with Retry.
        .catch((error: unknown) => {
          if (error instanceof ApiProblem && error.status === 501) return []
          throw error
        })
        .then((items) => ({ membership, items }))
    )
  )
  return pages.flatMap(({ membership, items }) =>
    items
      .filter((item) => {
        if (item.kind === 'ledger') return membershipCan(membership, 'ledger.view', item.project_id ?? undefined)
        return membershipCan(membership, 'project.view', item.project_id ?? undefined)
      })
      .map((item) => ({
        id: `search:${membership.org_id}:${item.kind}:${item.id}`,
        label: item.label,
        keywords: [item.id, item.external_id ?? '', item.kind],
        kind: 'results' as const,
        translateNo: item.kind === 'source' && !!item.external_id,
        onSelect: () => context.navigate(item.href)
      }))
  )
}

export const dashboardPaletteSource: PaletteSource = {
  id: 'dashboard',
  roles: 'all',
  load,
  itemsFor(context) {
    const themeItems: PaletteItem[] = (['light', 'dark', 'system'] as const).map((theme) => ({
      id: `theme:${theme}`,
      label: t(`palette.${theme}`),
      keywords: ['theme', 'appearance'],
      kind: 'appearance',
      onSelect: () => context.changeTheme(theme)
    }))
    return [...actionItems(context), ...themeItems]
  },
  search
}
