import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Verdicts } from '../../shared'
import { CheckResult, SheetContentBody } from './_shared'

export const evaluateClauseSheet = createRoute({
  method: 'post',
  path: '/v1/clause-sheets/{id}/evaluate',
  operationId: 'evaluateClauseSheet',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    body: { content: { 'application/json': { schema: SheetContentBody } } }
  },
  responses: {
    200: {
      description: 'Type-check and evaluate a clause sheet against current indicators',
      content: { 'application/json': { schema: z.object({ check: CheckResult, verdicts: Verdicts }) } }
    },
    ...commonErrors,
    422: problemResponse('The clause sheet cannot be evaluated')
  },
  x: { owner: 'b-clause-sheets-api', statement: 'project.view', idempotent: false }
})
