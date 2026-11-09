import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, SheetVersion } from '../../shared'

export const listClauseSheetVersions = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/versions',
  operationId: 'listClauseSheetVersions',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Immutable clause sheet versions',
      content: { 'application/json': { schema: Page(SheetVersion) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})
