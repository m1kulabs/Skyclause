import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { NightView } from './_shared'

export const listNights = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/nights',
  operationId: 'listNights',
  tags: ['nights'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Forecast nights for the project',
      content: { 'application/json': { schema: Page(NightView) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-forecast', statement: 'project.view', idempotent: false }
})
