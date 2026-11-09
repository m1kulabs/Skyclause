import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { LedgerVerification } from './_shared'

export const verifyLedger = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/ledger/verify',
  operationId: 'verifyLedger',
  tags: ['ledger'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: LedgerVerification } } }
  },
  x: { owner: 'c-ledger-chain', statement: 'ledger.view', idempotent: false }
})
