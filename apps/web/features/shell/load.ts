import type { ShellData } from './types'
import { shellOperations } from './operations'

type Page<Item> = { data: Item[]; next_cursor: string | null }

async function read<Value>(
  operation: { path: string; method: string; response: { parse(value: unknown): Value } },
  requestHeaders: Headers,
  org?: string,
  cursor?: string
): Promise<Value> {
  const url = new URL(operation.path, process.env.API_ORIGIN ?? 'https://api.skyclause.m1ku.tech')
  if (cursor) url.searchParams.set('cursor', cursor)
  const headers = new Headers({ Accept: 'application/json' })
  for (const name of ['cookie', 'authorization']) {
    const value = requestHeaders.get(name)
    if (value) headers.set(name, value)
  }
  if (org) headers.set('Skyclause-Organization', org)
  const response = await fetch(url, {
    method: operation.method.toUpperCase(),
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error(`Shell read failed: ${response.status}`)
  return operation.response.parse(await response.json())
}

async function readPages<Item>(
  operation: { path: string; method: string; response: { parse(value: unknown): Page<Item> } },
  headers: Headers,
  org?: string
): Promise<Item[]> {
  const data: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(operation, headers, org, cursor)
    data.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated shell pagination cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return data
}

/** The shell can render before membership and project owners ship their reads. */
export async function loadShellData(requestHeaders = new Headers()): Promise<ShellData> {
  const preferenceRead = read(shellOperations.getMyPreferences, requestHeaders).catch(() => undefined)
  const memberships = await readPages(shellOperations.listMyMemberships, requestHeaders).catch(() => [])
  const projectLists = await Promise.all(
    memberships.map(async (membership) => {
      const projects = await readPages(shellOperations.listProjects, requestHeaders, membership.org_slug).catch(
        () => []
      )
      return projects.filter((project) => project.org_id === membership.org_id)
    })
  )
  const preferences = await preferenceRead
  return { memberships, projects: projectLists.flat(), sidebarCollapsed: preferences?.sidebar_collapsed === true }
}
