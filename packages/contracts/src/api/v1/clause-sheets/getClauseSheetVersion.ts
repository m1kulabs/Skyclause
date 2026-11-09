import { OrganizationHeaders as OrganizationHeader, CommonErrors as commonErrors } from '../../common'
import { createRoute } from '../../create-route'
import { SheetVersion } from '../../shared'
import { VersionParams } from './_shared'

export const getClauseSheetVersion = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/versions/{n}',
  operationId: 'getClauseSheetVersion',
  tags: ['clause-sheets'],
  request: { params: VersionParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A numbered clause sheet version', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})
