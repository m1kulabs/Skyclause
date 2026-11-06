import { problemResponse, OrganizationHeaders } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery } from '../shared'

const searchResultSchema = z.object({
  kind: z.enum(['project', 'source', 'window', 'call']),
  id: z.string(),
  label: z.string(),
  href: z.string(),
  project_id: z.string().nullable(),
  external_id: z.string().nullable()
})

export const searchOrganisation = createRoute({
  method: 'get',
  path: '/v1/search',
  operationId: 'searchOrganisation',
  tags: ['Search'],
  request: {
    headers: OrganizationHeaders,
    query: PageQuery.extend({ q: z.string().trim().min(1).max(200) })
  },
  responses: {
    200: {
      description: 'Matching organisation resources.',
      content: { 'application/json': { schema: Page(searchResultSchema) } }
    },
    400: problemResponse('The organisation header or search query is invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The caller lacks project view permission.'),
    404: problemResponse('The organisation was not found.')
  },
  x: { owner: 'd-org-api', statement: 'project.view', idempotent: false }
})

export const routes = [searchOrganisation] as const
