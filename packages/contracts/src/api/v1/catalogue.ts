import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery, Problem, Reading, Source } from '../shared'

const OrganizationHeaders = z.object({ 'Skyclause-Organization': z.string().min(1) })
const ReadingForOpenApi = Reading.omit({ value_json: true }).extend({ value_json: z.unknown().nullable() })
const CatalogueSource = Source.extend({
  latest_reading: ReadingForOpenApi.nullable(),
  age_s: z.number().int().nonnegative().nullable()
})

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

export const listCatalogueSources = createRoute({
  method: 'get',
  path: '/v1/catalogue/sources',
  operationId: 'listCatalogueSources',
  tags: ['Sources'],
  request: { headers: OrganizationHeaders, query: PageQuery },
  responses: {
    200: {
      description: 'Sources available to bind',
      content: { 'application/json': { schema: Page(CatalogueSource) } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    422: problemResponse('The request parameters are invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-source-binding', statement: 'project.view', idempotent: false }
})

export const routes = [listCatalogueSources] as const
