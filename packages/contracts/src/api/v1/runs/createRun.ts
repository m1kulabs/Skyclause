import {
  UuidIdParams as IdParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Run } from '../../shared'
import { CreateRunBody } from './_shared'

export const createRun = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/runs',
  operationId: 'createRun',
  tags: ['runs'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: CreateRunBody } } }
  },
  responses: {
    202: { description: 'A queued run request', content: { 'application/json': { schema: Run } } },
    ...commonErrors,
    422: problemResponse('The run request cannot be fulfilled')
  },
  x: { owner: 'c-run-orchestrator', statement: 'run.request', idempotent: true }
})
