import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { SheetInput } from '../../../clauses'
import { ReplayRange, WhatIfReplay } from './_shared'

export const evaluateWhatIf = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/analysis/what-if',
  operationId: 'evaluateWhatIf',
  tags: ['analysis'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ sheet: SheetInput, range: ReplayRange }) } }
    }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: WhatIfReplay } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})
