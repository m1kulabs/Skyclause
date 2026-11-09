import { OrganizationHeaders, IdParams as SourceParams } from '../../common'
import { createRoute } from '../../create-route'
import { Page, Poll } from '../../shared'
import { PageRequest, projectErrors } from './_shared'

export const listSourcePolls = createRoute({
  method: 'get',
  path: '/v1/sources/{id}/polls',
  operationId: 'listSourcePolls',
  tags: ['Polls'],
  request: { headers: OrganizationHeaders, params: SourceParams, query: PageRequest },
  responses: {
    200: { description: 'Source poll history', content: { 'application/json': { schema: Page(Poll) } } },
    ...projectErrors
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})
