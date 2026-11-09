import {
  UuidIdParams as IdParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { SheetVersion } from '../../shared'
import { SheetContentBody } from './_shared'

export const createClauseSheetDraft = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/drafts',
  operationId: 'createClauseSheetDraft',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: SheetContentBody } } }
  },
  responses: {
    201: { description: 'A saved clause sheet draft', content: { 'application/json': { schema: SheetVersion } } },
    ...commonErrors,
    409: problemResponse('A conflicting draft prevents this save'),
    422: problemResponse('The clause sheet is invalid')
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_draft.edit', idempotent: true }
})
