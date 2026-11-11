import { OrganizationHeaders, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Page, PageQuery, Reading, Source, SourceKind, SourceState } from '../shared'

const CatalogueSource = Source.extend({
  distance_km: z.number().nonnegative().nullable(),
  latest_reading: Reading.nullable(),
  age_s: z.number().int().nonnegative().nullable(),
  source_state: SourceState.nullable()
})

export const listCatalogueSources = createRoute({
  method: 'get',
  path: '/v1/catalogue/sources',
  operationId: 'listCatalogueSources',
  tags: ['Sources'],
  request: {
    headers: OrganizationHeaders,
    query: PageQuery.extend({
      kind: SourceKind.optional(),
      near: z
        .string()
        .refine((value) => {
          const parts = value.split(',')
          if (parts.length !== 2 || parts.some((part) => !part.trim())) return false
          const [lat, lon] = parts.map(Number)
          return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180
        }, 'Expected latitude [-90,90],longitude [-180,180]')
        .optional(),
      q: z.string().optional()
    })
  },
  responses: {
    200: {
      description: 'Sources available to bind',
      content: { 'application/json': { schema: Page(CatalogueSource) } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The organization is unavailable to this principal.'),
    422: problemResponse('The request parameters are invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-source-binding', statement: 'project.view', idempotent: false }
})

export const routes = [listCatalogueSources] as const
