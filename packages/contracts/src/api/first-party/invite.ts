import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Membership, Problem } from '../shared'

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

const sessionErrors = {
  401: problemResponse('A signed-in session is required.'),
  429: problemResponse('The request is rate limited.')
}

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
    410: problemResponse('The invitation expired or was withdrawn.')
  },
  x: { owner: 'a-members-api', statement: 'session', idempotent: false }
})

export const routes = [acceptInvitation] as const
