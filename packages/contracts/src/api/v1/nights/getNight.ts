import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { NightView } from './_shared'

export const getNight = createRoute({
  method: 'get',
  path: '/v1/nights/{id}',
  operationId: 'getNight',
  tags: ['nights'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'A forecast night with its current forecast',
      content: { 'application/json': { schema: NightView } }
    },
    ...commonErrors
  },
  x: { owner: 'b-forecast', statement: 'project.view', idempotent: false }
})
