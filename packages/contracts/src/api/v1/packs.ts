import { OrganizationHeaders, problemResponse, IdParams } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Pack, ProjectPack } from '../shared'
import { packPrerequisitesResponse } from './sources'

const PackParams = IdParams.extend({ pack: Pack })
const PackUpdate = z
  .object({
    enabled: z.boolean().optional(),
    sla_s: z.number().int().positive().nullable().optional()
  })
  .refine((input) => input.enabled !== undefined || input.sla_s !== undefined, {
    message: 'At least one pack setting must be supplied.'
  })

export const updateProjectPack = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}/packs/{pack}',
  operationId: 'updateProjectPack',
  tags: ['Projects'],
  request: {
    headers: OrganizationHeaders,
    params: PackParams,
    body: { content: { 'application/json': { schema: PackUpdate } } }
  },
  responses: {
    200: { description: 'Updated project pack', content: { 'application/json': { schema: ProjectPack } } },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks sources.manage permission or Crowd is disabled by feature flag.'),
    404: problemResponse('The project or pack is unavailable in this organization.'),
    409: packPrerequisitesResponse,
    422: problemResponse('The request is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-source-binding', statement: 'sources.manage', idempotent: false }
})

export const routes = [updateProjectPack] as const
