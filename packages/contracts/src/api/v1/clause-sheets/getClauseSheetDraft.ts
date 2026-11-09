import { OrganizationHeaders as OrganizationHeader, CommonErrors as commonErrors } from '../../common'
import { createRoute } from '../../create-route'
import { SheetVersion } from '../../shared'
import { DraftParams } from './_shared'

export const getClauseSheetDraft = createRoute({
  method: 'get',
  path: '/v1/clause-sheets/{id}/drafts/{draftId}',
  operationId: 'getClauseSheetDraft',
  tags: ['clause-sheets'],
  request: { params: DraftParams, headers: OrganizationHeader },
  responses: {
    200: { description: 'A saved clause sheet draft', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})
