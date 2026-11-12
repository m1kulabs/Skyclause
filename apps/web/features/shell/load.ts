import { ApiProblem, createApiFetch } from '../../lib/api-fetch'
import type { ShellData, ShellReadError } from './types'
import { shellOperations } from './operations'
import { SHELL_HARNESS_COOKIE, shellHarnessData } from './test-request'

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

function readError(error: unknown): ShellReadError {
  return { status: error instanceof ApiProblem ? error.status : null, at: new Date().toISOString() }
}

function harnessCookie(requestHeaders: Headers): string | undefined {
  const prefix = `${SHELL_HARNESS_COOKIE}=`
  return requestHeaders
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
}

/** The memberships and their projects, or the read that failed. Never a sample organisation. */
export async function loadShellData(requestHeaders = new Headers()): Promise<ShellData> {
  // Server reads can't be stubbed from the browser: the test runtime takes the planted harness's cookie instead.
  if (process.env.APP_ENV === 'test') return shellHarnessData(harnessCookie(requestHeaders))

  const headers = forwardedHeaders(requestHeaders)
  let memberships: ShellData['memberships']
  try {
    memberships = await readPages((cursor) =>
      apiFetch('listMyMemberships', {
        headers,
        query: { cursor },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      })
    )
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 401) return { memberships: [], projects: [], signedOut: true }
    return { memberships: [], projects: [], membershipsError: readError(error) }
  }
  const projectsError: Record<string, ShellReadError> = {}
  const projectLists = await Promise.all(
    memberships.map(async (membership) => {
      try {
        const projects = await readPages((cursor) =>
          apiFetch('listProjects', {
            headers,
            org: membership.org_slug,
            query: { cursor },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000)
          })
        )
        return projects.filter((project) => project.org_id === membership.org_id)
      } catch (error) {
        projectsError[membership.org_id] = readError(error)
        return []
      }
    })
  )
  return {
    memberships,
    projects: projectLists.flat(),
    ...(Object.keys(projectsError).length ? { projectsError } : {})
  }
}
