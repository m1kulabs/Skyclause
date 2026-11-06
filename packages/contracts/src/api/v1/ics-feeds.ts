import {
  UuidIdParams as ProjectParams,
  UuidIdParams as FeedParams,
  OrganizationHeaders as OrganizationHeader,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { IcsFeed, Page, PageQuery } from '../shared'

const IcsFeedBody = z.object({ url: z.url() })

export const listIcsFeeds = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ics-feeds',
  operationId: 'listIcsFeeds',
  tags: ['ics-feeds'],
  request: { params: ProjectParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'ICS calendars imported by the project',
      content: { 'application/json': { schema: Page(IcsFeed) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'project.view', idempotent: false }
})

export const createIcsFeed = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/ics-feeds',
  operationId: 'createIcsFeed',
  tags: ['ics-feeds'],
  request: {
    params: ProjectParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: IcsFeedBody } } }
  },
  responses: {
    201: { description: 'An imported ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors,
    422: problemResponse('The calendar URL is unsafe or cannot be imported')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: true }
})

export const deleteIcsFeed = createRoute({
  method: 'delete',
  path: '/v1/ics-feeds/{id}',
  operationId: 'deleteIcsFeed',
  tags: ['ics-feeds'],
  request: { params: FeedParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'The removed ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})

export const routes = [listIcsFeeds, createIcsFeed, deleteIcsFeed] as const
