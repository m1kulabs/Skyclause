import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../../common'
import { createRoute } from '../../create-route'
import { EvidenceRequestView } from './_shared'

export const getEvidenceRequest = createRoute({
  method: 'get',
  path: '/v1/evidence-requests/{id}',
  operationId: 'getEvidenceRequest',
  tags: ['evidence-requests'],
  request: { headers: OrganizationHeaders, params: IdParams },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: EvidenceRequestView } } }
  },
  x: { owner: 'c-evidence', statement: 'evidence.request', idempotent: false }
})
