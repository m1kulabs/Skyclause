import { OrganizationHeaders, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery, Reading, Source } from '../shared'

const CatalogueSource = Source.extend({
  latest_reading: Reading.nullable(),
  age_s: z.number().int().nonnegative().nullable()
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
