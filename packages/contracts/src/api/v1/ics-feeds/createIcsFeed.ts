import {
  UuidIdParams as ProjectParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { IcsFeed } from '../../shared'
import { IcsFeedBody } from './_shared'

export const createIcsFeed = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/ics-feeds',
  operationId: 'createIcsFeed',
  tags: ['ics-feeds'],
  request: {
    params: ProjectParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: IcsFeedBody } } }
  },
  responses: {
    201: { description: 'An imported ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors,
    422: problemResponse('The calendar URL is unsafe or cannot be imported')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: true }
})
