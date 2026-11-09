import {
  UuidIdParams as IdParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { ReplayRequest, ReplayResult } from './_shared'

export const createReplay = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/replay',
  operationId: 'createReplay',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: ReplayRequest } } }
  },
  responses: {
    201: { description: 'A labelled replay result', content: { 'application/json': { schema: ReplayResult } } },
    ...commonErrors,
    422: problemResponse('The replay range or sheet version is invalid')
  },
  x: { owner: 'b-replay', statement: 'project.view', idempotent: true }
})
