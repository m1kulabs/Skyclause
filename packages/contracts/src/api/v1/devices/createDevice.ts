import {
  IdempotentOrganizationHeaders as OrganizationHeaders,
  IdParams as ProjectParams,
  problemResponse
} from '../../common'
import { createRoute } from '../../create-route'
import { CreatedDevice, DeviceInput } from './_shared'

export const createDevice = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/devices',
  operationId: 'createDevice',
  tags: ['Devices'],
  request: {
    headers: OrganizationHeaders,
    params: ProjectParams,
    body: { content: { 'application/json': { schema: DeviceInput } } }
  },
  responses: {
    201: {
      description: 'Device source and one-time credential',
      content: { 'application/json': { schema: CreatedDevice } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks sources.manage permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    422: problemResponse('The device request is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-device-ingest', statement: 'sources.manage', idempotent: true }
})
