import { SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { membershipSummary } from './_shared'

export const listMyMemberships = createRoute({
  method: 'get',
  path: '/api/me/memberships',
  operationId: 'listMyMemberships',
  tags: ['Memberships'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s organisation memberships.',
      content: { 'application/json': { schema: Page(membershipSummary) } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-org-projects', statement: 'session', idempotent: false }
})
