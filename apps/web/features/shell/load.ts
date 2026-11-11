import { createApiFetch } from '../../lib/api-fetch'
import type { ShellData } from './types'
import { shellOperations } from './operations'

type Page<Item> = { data: Item[]; next_cursor: string | null }

const apiFetch = createApiFetch(shellOperations)

function forwardedHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers()
  for (const name of ['cookie', 'authorization']) {
    const value = requestHeaders.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

async function readPages<Item>(read: (cursor?: string) => Promise<Page<Item>>): Promise<Item[]> {
  const data: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    data.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated shell pagination cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return data
}

/** The shell can render before membership and project owners ship their reads. */
export async function loadShellData(requestHeaders = new Headers()): Promise<ShellData> {
  if (process.env.APP_ENV === 'test') return { memberships: [], projects: [], sidebarCollapsed: false }

  const headers = forwardedHeaders(requestHeaders)
  const preferenceRead = apiFetch('getMyPreferences', {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000)
  }).catch(() => undefined)
  const memberships = await readPages((cursor) =>
    apiFetch('listMyMemberships', {
      headers,
      query: { cursor },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    })
  ).catch(() => [])
  const projectLists = await Promise.all(
    memberships.map(async (membership) => {
      const projects = await readPages((cursor) =>
        apiFetch('listProjects', {
          headers,
          org: membership.org_slug,
          query: { cursor },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000)
        })
      ).catch(() => [])
      return projects.filter((project) => project.org_id === membership.org_id)
    })
  )
  const preferences = await preferenceRead
  return { memberships, projects: projectLists.flat(), sidebarCollapsed: preferences?.sidebar_collapsed === true }
}
