import { ProblemResponse, ReauthProblems as CommonProblems, IdParams } from '../common'
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
// #499: an approver's answer to a missing call (`Bundle.missing`), named by its window or night: `draft` adds the
// engine's call for it (D23's shadow pick: the fired clauses' wording, no model), `dismiss` needs a reason.
const MissingDecision = z.object({
  window_id: z.string().optional(),
  night_id: z.string().optional(),
  action: z.enum(['draft', 'dismiss']),
  reason: z.string().trim().min(1).max(500).optional()
})
const ApprovalConflict = Problem.extend({
  review_hash: z.string().optional(),
  changed_inputs: z.array(z.object({ call_id: z.string(), before: InputValue, after: InputValue })).optional(),
  changed_verdicts: z.array(z.object({ call_id: z.string(), before: Verdict, after: Verdict })).optional(),
  superseded_by_call_id: z.string().optional()
})

export const approveBundle = createRoute({
  method: 'post',
  path: '/api/bundles/{id}/approve',
  operationId: 'approveBundle',
  tags: ['bundles'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            review_hash: z.string(),
            reconfirm: z.boolean().default(false),
            // Empty only for a bundle whose open items are all missing calls (#499).
            calls: z.array(CallDecision),
            missing: z.array(MissingDecision).optional()
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
