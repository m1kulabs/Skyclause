import {
  UuidIdParams as FeedParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { IcsFeed } from '../../shared'

export const deleteIcsFeed = createRoute({
  method: 'delete',
  path: '/v1/ics-feeds/{id}',
  operationId: 'deleteIcsFeed',
  tags: ['ics-feeds'],
  request: { params: FeedParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'The removed ICS calendar', content: { 'application/json': { schema: IcsFeed } } },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})
