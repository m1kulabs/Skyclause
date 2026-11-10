import { listProjectBundles as bundles } from '@skyclause/contracts/api/v1/bundles'
import { listProjectDays as days } from '@skyclause/contracts/api/v1/days'
import { listIcsFeeds as feeds, createIcsFeed as importFeed } from '@skyclause/contracts/api/v1/ics-feeds'
import { listNights as nights } from '@skyclause/contracts/api/v1/nights'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects'
import {
  listWindows as windows,
  createWindow as create,
  updateWindow as update,
  cancelWindow as cancel
} from '@skyclause/contracts/api/v1/windows'
import { createApiFetch } from '../../lib/api-fetch'

export const windowsOperations = {
  listProjects: {
    method: projects.method.toUpperCase(),
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  },
  listWindows: {
    method: windows.method.toUpperCase(),
    path: windows.path,
    request: { params: windows.request.params, query: windows.request.query },
    response: windows.responses[200].content['application/json'].schema
  },
  listIcsFeeds: {
    method: feeds.method.toUpperCase(),
    path: feeds.path,
    request: { params: feeds.request.params, query: feeds.request.query },
    response: feeds.responses[200].content['application/json'].schema
  },
  listProjectDays: {
    method: days.method.toUpperCase(),
    path: days.path,
    request: { params: days.request.params, query: days.request.query },
    response: days.responses[200].content['application/json'].schema
  },
  listNights: {
    method: nights.method.toUpperCase(),
    path: nights.path,
    request: { params: nights.request.params, query: nights.request.query },
    response: nights.responses[200].content['application/json'].schema
  },
  listProjectBundles: {
    method: bundles.method.toUpperCase(),
    path: bundles.path,
    request: { params: bundles.request.params, query: bundles.request.query },
    response: bundles.responses[200].content['application/json'].schema
  },
  createWindow: {
    method: create.method.toUpperCase(),
    path: create.path,
    idempotent: create['x-skyclause'].idempotent,
    request: { params: create.request.params, body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema
  },
  updateWindow: {
    method: update.method.toUpperCase(),
    path: update.path,
    request: {
      params: update.request.params,
      query: update.request.query,
      body: update.request.body.content['application/json'].schema
    },
    response: update.responses[200].content['application/json'].schema
  },
  cancelWindow: {
    method: cancel.method.toUpperCase(),
    path: cancel.path,
    request: { params: cancel.request.params, query: cancel.request.query },
    response: cancel.responses[200].content['application/json'].schema
  },
  createIcsFeed: {
    method: importFeed.method.toUpperCase(),
    path: importFeed.path,
    idempotent: importFeed['x-skyclause'].idempotent,
    request: { params: importFeed.request.params, body: importFeed.request.body.content['application/json'].schema },
    response: importFeed.responses[201].content['application/json'].schema
  }
}

export const windowsApi = createApiFetch(windowsOperations)
export type WindowView = ReturnType<typeof windowsOperations.listWindows.response.parse>['data'][number]
export type NightView = ReturnType<typeof windowsOperations.listNights.response.parse>['data'][number]
export type DayView = ReturnType<typeof windowsOperations.listProjectDays.response.parse>['data'][number]
export type FeedView = ReturnType<typeof windowsOperations.listIcsFeeds.response.parse>['data'][number]
export type BundleView = ReturnType<typeof windowsOperations.listProjectBundles.response.parse>['data'][number]

export async function allPages<Item>(
  read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>
): Promise<Item[]> {
  const data: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    data.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated windows pagination cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return data
}

export async function resolveProject(org: string, slug: string, signal?: AbortSignal) {
  const projects = await allPages((cursor) =>
    windowsApi('listProjects', { query: { slug, limit: 200, cursor }, org, signal })
  )
  const project = projects.find((item) => item.slug === slug)
  if (!project) throw new Error('Project unavailable')
  return project
}
