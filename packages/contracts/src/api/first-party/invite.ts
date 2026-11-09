import { problemResponse, SessionErrors as sessionErrors } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Membership } from '../shared'

const membershipSummary = Membership.extend({ org_name: z.string(), org_slug: z.string() })

export const acceptInvitation = createRoute({
  method: 'post',
  path: '/api/invite/{token}',
  operationId: 'acceptInvitation',
  tags: ['Invitations'],
  request: { params: z.object({ token: z.string().min(1) }) },
  responses: {
    201: {
      description: 'The invitation was accepted and the account joined the organisation.',
      content: { 'application/json': { schema: membershipSummary } }
    },
    ...sessionErrors,
    404: problemResponse('The invitation token does not exist.'),
    409: problemResponse('The invitation was already used.'),
    410: problemResponse('The invitation expired or was withdrawn.'),
    429: problemResponse('The request is rate limited.')
  },
  x: { owner: 'a-members-api', statement: 'token', idempotent: false }
})

export const routes = [acceptInvitation] as const
