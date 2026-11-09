import {
  NonEmptyIdParams as IdParams,
  ScopedIdempotentOrganizationHeaders as IdempotentHeaders,
  ProblemResponses,
  ProblemContent
} from '../../common'
import { createRoute } from '../../create-route'
import { EvidenceRequestInput, EvidenceRequestView } from './_shared'

export const createEvidenceRequest = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/evidence-requests',
  operationId: 'createEvidenceRequest',
  tags: ['evidence-requests'],
  request: {
    headers: IdempotentHeaders,
    params: IdParams,
    body: { required: true, content: { 'application/json': { schema: EvidenceRequestInput } } }
  },
  responses: {
    ...ProblemResponses,
    202: {
      description: 'Evidence assembly accepted; external replies wait for human approval.',
      content: { 'application/json': { schema: EvidenceRequestView } }
    },
    422: {
      description: 'idempotency-mismatch or validation-failed.',
      content: ProblemContent
    }
  },
  x: { owner: 'c-evidence', statement: 'evidence.request', idempotent: true }
})
