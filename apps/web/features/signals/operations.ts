import { getProjectStrip as strip } from '@skyclause/contracts/api/v1/strip'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects'
import {
  listProjectSources as projectSources,
  listSourcePolls as sourcePolls,
  listSourceReadings as sourceReadings
} from '@skyclause/contracts/api/v1/sources'
import { streamReadings } from '@skyclause/contracts/api/v1/readings'
import { createApiFetch } from '../../lib/api-fetch'

function jsonOperation<
  const Route extends {
    method: string
    path: string
    request?: object
    responses: { 200: { content: { 'application/json': { schema: { parse(value: unknown): unknown } } } } }
  }
>(
  route: Route
): {
  method: Uppercase<Route['method']>
  path: Route['path']
  request: Route['request']
  response: Route['responses'][200]['content']['application/json']['schema']
} {
  return {
    method: route.method.toUpperCase() as Uppercase<Route['method']>,
    path: route.path,
    request: route.request,
    response: route.responses[200].content['application/json'].schema
  }
}

export const signalsOperations = {
  listProjects: jsonOperation(projects),
  listProjectSources: jsonOperation(projectSources),
  getProjectStrip: jsonOperation(strip),
  listSourceReadings: jsonOperation(sourceReadings),
  listSourcePolls: jsonOperation(sourcePolls),
  streamReadings: {
    method: streamReadings.method.toUpperCase(),
    path: streamReadings.path,
    request: { params: streamReadings.request.params },
    response: streamReadings.responses[200].content['text/event-stream'].schema
  }
}

export const apiFetch = createApiFetch(signalsOperations)
export type Project = ReturnType<typeof signalsOperations.listProjects.response.parse>['data'][number]
export type ProjectSource = ReturnType<typeof signalsOperations.listProjectSources.response.parse>['data'][number]
export type ProjectStrip = ReturnType<typeof signalsOperations.getProjectStrip.response.parse>
export type SourceReading = ReturnType<typeof signalsOperations.listSourceReadings.response.parse>['data'][number]
export type SourcePoll = ReturnType<typeof signalsOperations.listSourcePolls.response.parse>['data'][number]

export async function allPages<Item>(
  read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>
): Promise<Item[]> {
  const items: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    items.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated Signals pagination cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}

export function readProjects(org: string, slug: string, signal: AbortSignal) {
  return allPages((cursor) => apiFetch('listProjects', { org, query: { slug, limit: 200, cursor }, signal }))
}

export function readProjectSources(org: string, id: string, signal: AbortSignal) {
  return allPages((cursor) =>
    apiFetch('listProjectSources', { org, params: { id }, query: { limit: 200, cursor }, signal })
  )
}

export async function readSourceReadings(org: string, id: string, signal: AbortSignal, days = 56) {
  const items: SourceReading[] = []
  const seen = new Set<string>()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let cursor: string | undefined
  do {
    const page = await apiFetch('listSourceReadings', {
      org,
      params: { id },
      query: { limit: 200, cursor },
      signal
    })
    items.push(...page.data)
    const oldest = Math.min(...page.data.map((reading) => Date.parse(reading.observed_at)))
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated source reading cursor')
    if (cursor) seen.add(cursor)
    if (!cursor || (page.data.length > 0 && oldest < cutoff)) break
  } while (cursor)
  return items.filter((reading) => Date.parse(reading.observed_at) >= cutoff)
}

export async function readSourcePolls(org: string, id: string, signal: AbortSignal) {
  const items: SourcePoll[] = []
  const seen = new Set<string>()
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let cursor: string | undefined
  do {
    const page = await apiFetch('listSourcePolls', { org, params: { id }, query: { limit: 200, cursor }, signal })
    items.push(...page.data)
    const oldest = Math.min(...page.data.map((poll) => Date.parse(poll.started_at)))
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated source poll cursor')
    if (cursor) seen.add(cursor)
    if (!cursor || (page.data.length > 0 && oldest < cutoff)) break
  } while (cursor)
  return items.filter((poll) => Date.parse(poll.started_at) >= cutoff)
}
