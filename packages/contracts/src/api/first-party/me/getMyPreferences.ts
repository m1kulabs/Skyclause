import { SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { Preferences } from '../../shared'

export const getMyPreferences = createRoute({
  method: 'get',
  path: '/api/me/preferences',
  operationId: 'getMyPreferences',
  tags: ['Preferences'],
  responses: {
    200: {
      description: 'The signed-in account’s preferences.',
      content: { 'application/json': { schema: Preferences } }
    },
    ...sessionErrors
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})
