import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { EvidenceRequest, Problem } from '../shared'

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const approveEvidenceRequest = createRoute({
  method: 'post',
  path: '/api/evidence-requests/{id}/approve',
  operationId: 'approveEvidenceRequest',
  tags: ['evidence-requests'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: EvidenceRequest } } },
    409: { ...ProblemResponse, description: 'The evidence reply is not awaiting approval' }
  },
  x: { owner: 'c-evidence', statement: 'bundle.approve', idempotent: false }
})

export const routes = [approveEvidenceRequest] as const
