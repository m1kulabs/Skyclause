import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { ReplayResult } from './_shared'

export const getReplay = createRoute({
  method: 'get',
  path: '/v1/replays/{id}',
  operationId: 'getReplay',
  tags: ['replays'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A labelled clause replay', content: { 'application/json': { schema: ReplayResult } } },
    ...commonErrors
  },
  x: { owner: 'b-replay', statement: 'project.view', idempotent: false }
})
