import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { LedgerFilters } from './_shared'

export const exportLedger = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger/export',
  operationId: 'exportLedger',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams, query: LedgerFilters },
  responses: {
    ...ProblemResponses,
    200: {
      description: 'CSV export of the filtered ledger, with window, mode, approver role, delay and grade.',
      content: { 'text/csv': { schema: z.string() } }
    }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})
