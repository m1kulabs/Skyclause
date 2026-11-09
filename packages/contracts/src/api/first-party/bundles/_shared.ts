import { z } from '@hono/zod-openapi'
import { InputValue, Notice, Verdict, Problem } from '../../shared'

export const CallDecision = z.object({
  call_id: z.string(),
  action: z.enum(['approve', 'edit', 'reject']),
  chosen: z.enum(['agent', 'shadow']).optional(),
  recipients: z.array(z.string()).optional(),
  notices: z.array(Notice).optional()
})

export const ApprovalConflict = Problem.extend({
  review_hash: z.string().optional(),
  changed_inputs: z.array(z.object({ call_id: z.string(), before: InputValue, after: InputValue })).optional(),
  changed_verdicts: z.array(z.object({ call_id: z.string(), before: Verdict, after: Verdict })).optional(),
  superseded_by_call_id: z.string().optional()
})
