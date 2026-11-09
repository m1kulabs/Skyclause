import { OrganizationHeaders, IdParams as SourceParams } from '../../common'
import { createRoute } from '../../create-route'
import { Page, Reading } from '../../shared'
import { PageRequest, projectErrors } from './_shared'

export const listSourceReadings = createRoute({
  method: 'get',
  path: '/v1/sources/{id}/readings',
  operationId: 'listSourceReadings',
  tags: ['Readings'],
  request: { headers: OrganizationHeaders, params: SourceParams, query: PageRequest },
  responses: {
    200: { description: 'Source readings', content: { 'application/json': { schema: Page(Reading) } } },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})
