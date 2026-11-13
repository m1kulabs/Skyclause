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

// #143 uploads the original bytes as text; #139 owns calendar parsing and validation.
const IcsFeedBody = z.union([
  z.object({ url: z.url(), kind: z.enum(['class', 'event', 'commute_wave']).default('class') }).strict(),
  z
    .object({
      kind: z.enum(['class', 'event', 'commute_wave']).default('class'),
      file: z
        .object({
          name: z.string().min(1).max(255),
          content: z
            .string()
            .min(1)
            .max(5 * 1024 * 1024)
            .refine(
              (content) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(content),
              'File must be valid UTF-8'
            )
            .refine((content) => new TextEncoder().encode(content).byteLength <= 5 * 1024 * 1024, 'File exceeds 5 MiB')
        })
        .strict()
    })
    .strict()
])

export const listIcsFeeds = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ics-feeds',
  operationId: 'listIcsFeeds',
  tags: ['ics-feeds'],
  request: { params: ProjectParams, headers: OrganizationHeader, query: PageQuery.strict() },
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
    query: z.object({}).strict(),
    body: { content: { 'application/json': { schema: IcsFeedBody } } }
  },
  responses: {
    201: { description: 'A registered or imported ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors,
    422: problemResponse('The calendar URL is unsafe or cannot be imported')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: true }
})

export const getIcsFeed = createRoute({
  method: 'get',
  path: '/v1/ics-feeds/{id}',
  operationId: 'getIcsFeed',
  tags: ['ics-feeds'],
  request: { params: FeedParams, headers: OrganizationHeader, query: z.object({}).strict() },
  responses: {
    200: { description: 'An ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'project.view', idempotent: false }
})

export const deleteIcsFeed = createRoute({
  method: 'delete',
  path: '/v1/ics-feeds/{id}',
  operationId: 'deleteIcsFeed',
  tags: ['ics-feeds'],
  request: { params: FeedParams, headers: OrganizationHeader, query: z.object({}).strict() },
  responses: {
    200: { description: 'The removed ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})

export const routes = [listIcsFeeds, createIcsFeed, getIcsFeed, deleteIcsFeed] as const
