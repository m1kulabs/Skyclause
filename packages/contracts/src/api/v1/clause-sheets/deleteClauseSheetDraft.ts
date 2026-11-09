import { OrganizationHeaders as OrganizationHeader, CommonErrors as commonErrors, UuidIdParams } from '../../common'
import { createRoute } from '../../create-route'
import { DraftParams } from './_shared'

export const deleteClauseSheetDraft = createRoute({
  method: 'delete',
  path: '/v1/clause-sheets/{id}/drafts/{draftId}',
  operationId: 'deleteClauseSheetDraft',
  tags: ['clause-sheets'],
  request: { params: DraftParams, headers: OrganizationHeader },
  responses: {
    200: {
      description: 'The deleted draft identifier',
      content: { 'application/json': { schema: UuidIdParams } }
    },
    ...commonErrors
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: false }
})
