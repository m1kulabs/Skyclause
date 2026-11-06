import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Bundle, InputValue, Notice, Verdict, Problem } from '../shared'

const CallDecision = z.object({
  call_id: z.string(),
  action: z.enum(['approve', 'edit', 'reject']),
  chosen: z.enum(['agent', 'shadow']).optional(),
  recipients: z.array(z.string()).optional(),
  notices: z.array(Notice).optional()
})
const ApprovalConflict = Problem.extend({
  review_hash: z.string().optional(),
  changed_inputs: z.array(z.object({ call_id: z.string(), before: InputValue, after: InputValue })).optional(),
  changed_verdicts: z.array(z.object({ call_id: z.string(), before: Verdict, after: Verdict })).optional(),
  superseded_by_call_id: z.string().optional()
})

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required or reauth-required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

export const approveBundle = createRoute({
  method: 'post',
  path: '/api/bundles/{id}/approve',
  operationId: 'approveBundle',
  tags: ['bundles'],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            review_hash: z.string(),
            reconfirm: z.boolean().default(false),
            calls: z.array(CallDecision).min(1)
          })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    422: { ...ProblemResponse, description: 'validation-failed, redraft-required or malay-reader-required' },
    200: { description: 'Success', content: { 'application/json': { schema: Bundle } } },
    409: {
      description: 'inputs-changed, bundle-superseded or call-expired; review before confirming',
      content: { 'application/problem+json': { schema: ApprovalConflict } }
    }
  },
  x: { owner: 'c-approval-api', statement: 'bundle.approve', idempotent: false }
})

export const routes = [approveBundle] as const
