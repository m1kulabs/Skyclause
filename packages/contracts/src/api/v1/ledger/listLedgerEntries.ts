import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { PageQuery } from '../../shared'
import { LedgerFilters, LedgerPage } from './_shared'

export const listLedgerEntries = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger',
  operationId: 'listLedgerEntries',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams, query: PageQuery.extend(LedgerFilters.shape) },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: LedgerPage } } }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})
