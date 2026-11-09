import { OrganizationHeaders, problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { ProjectPack } from '../../shared'
import { PackParams, PackUpdate } from './_shared'

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
    403: problemResponse('The principal lacks sources.manage permission.'),
    404: problemResponse('The project or pack is unavailable in this organization.'),
    422: problemResponse('The pack cannot be enabled or the request is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-source-binding', statement: 'sources.manage', idempotent: false }
})
