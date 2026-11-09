import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery, SheetVersion } from '../../shared'

export const listClauseSheetDrafts = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/drafts',
  operationId: 'listClauseSheetDrafts',
  tags: ['clause-sheets'],
  request: { params: IdParams, headers: OrganizationHeader, query: PageQuery },
  responses: {
    200: {
      description: 'Saved draft versions of a clause sheet',
      content: { 'application/json': { schema: Page(SheetVersion) } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})
