import { ProblemResponse, CommonProblems, IdParams } from '../../common'
import { createRoute } from '../../create-route'
import { EvidenceRequest } from '../../shared'

export const approveEvidenceRequest = createRoute({
  method: 'post',
  path: '/api/evidence-requests/{id}/approve',
  operationId: 'approveEvidenceRequest',
  tags: ['evidence-requests'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: EvidenceRequest } } },
    409: { ...ProblemResponse, description: 'The evidence reply is not awaiting approval' }
  },
  x: { owner: 'c-evidence', statement: 'bundle.approve', idempotent: false }
})
