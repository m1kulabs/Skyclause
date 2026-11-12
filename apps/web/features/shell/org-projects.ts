import { cache } from 'react'
import { createApiFetch } from '../../lib/api-fetch'
import { shellOperations } from './operations'

const apiFetch = createApiFetch(shellOperations)

type Project = ReturnType<typeof shellOperations.listProjects.response.parse>['data'][number]

/** Each page of the projects list gets this long. */
const PAGE_TIMEOUT_MS = 5_000

/**
 * An organisation's projects with their summaries, every page. Request-scoped on the server (React `cache`): the
 * shell's read and the dashboard's are one read per render. Only the credential headers travel, and they are the
 * cache key, so no visitor ever gets another's list. In the browser it is a plain read.
 */
export const readOrgProjects = cache(
  async (org: string, cookie: string | null, authorization: string | null): Promise<Project[]> => {
    const headers = new Headers()
    if (cookie) headers.set('cookie', cookie)
    if (authorization) headers.set('authorization', authorization)
    const projects: Project[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const page = await apiFetch('listProjects', {
        headers,
        org,
        query: { limit: 200, cursor, include: 'summary' },
        cache: 'no-store',
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
      })
      projects.push(...page.data)
      cursor = page.next_cursor ?? undefined
      if (cursor && seen.has(cursor)) throw new Error('Repeated projects cursor')
      if (cursor) seen.add(cursor)
    } while (cursor)
    return projects
  }
)
