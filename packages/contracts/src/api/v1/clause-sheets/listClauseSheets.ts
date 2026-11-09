import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, ClauseSheet } from '../../shared'

export const listClauseSheets = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/clause-sheets',
  operationId: 'listClauseSheets',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Clause sheets enabled for the project',
      content: { 'application/json': { schema: Page(ClauseSheet) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})
