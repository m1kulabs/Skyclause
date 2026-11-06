import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../common'

import { createRoute } from '../create-route'
import { Forecast, Night, Page, PageQuery } from '../shared'

const NightView = Night.extend({ forecast: Forecast.nullable() })

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

export const routes = [listNights, getNight] as const
