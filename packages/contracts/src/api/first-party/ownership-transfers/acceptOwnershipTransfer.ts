import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { OwnershipTransfer } from '../../shared'

export const acceptOwnershipTransfer = createRoute({
  method: 'post',
  path: '/api/ownership-transfers/{token}/accept',
  operationId: 'acceptOwnershipTransfer',
  tags: ['Ownership Transfers'],
  request: { params: z.object({ token: z.string().min(1) }) },
  responses: {
    200: {
      description: 'The ownership transfer was accepted.',
      content: { 'application/json': { schema: OwnershipTransfer } }
    },
    401: problemResponse('A signed-in session is required.'),
    404: problemResponse('The ownership transfer token does not exist.'),
    409: problemResponse('The ownership transfer is no longer pending.'),
    410: problemResponse('The ownership transfer token expired.'),
    429: problemResponse('The request is rate limited.')
  },
  x: { owner: 'a-members-api', statement: 'session', idempotent: false }
})
