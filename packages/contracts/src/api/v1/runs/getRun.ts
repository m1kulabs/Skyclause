import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { RunDetail } from './_shared'

export const getRun = createRoute({
  method: 'get',
  path: '/v1/runs/{id}',
  operationId: 'getRun',
  tags: ['runs'],
  request: { params: IdParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A run and its current state', content: { 'application/json': { schema: RunDetail } } },
    ...commonErrors
  },
  x: { owner: 'c-run-orchestrator', statement: 'project.view', idempotent: false }
})
