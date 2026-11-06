import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { IcsFeed, Page, PageQuery, Problem } from '../shared'

const ProjectParams = z.object({ id: z.uuidv7() })
const FeedParams = z.object({ id: z.uuidv7() })
const OrganizationHeader = z.object({ 'Skyclause-Organization': z.string().min(1) })
const IdempotentHeaders = OrganizationHeader.extend({ 'Idempotency-Key': z.string().min(1) })
const IcsFeedBody = z.object({ url: z.url() })

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})
const commonErrors = {
  400: problemResponse('Invalid request'),
  401: problemResponse('Authentication required'),
  403: problemResponse('Insufficient permission'),
  404: problemResponse('Resource not found in this organisation'),
  429: problemResponse('Rate limit exceeded')
}

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
