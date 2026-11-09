import { IdempotencyHeaders, CommonProblems } from '../../common'
import { createRoute } from '../../create-route'
import { GuestBlock } from './_shared'

export const createModerationBlock = createRoute({
  method: 'post',
  path: '/api/admin/moderation/blocks',
  operationId: 'createModerationBlock',
  tags: ['admin'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': { schema: GuestBlock.pick({ subject_kind: true, subject_hash: true, reason: true }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    201: { description: 'Device or IP blocked', content: { 'application/json': { schema: GuestBlock } } }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: true }
})
