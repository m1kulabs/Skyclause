import { createRoute } from '../../create-route'
import { Preferences } from '../../shared'
import { validationErrors } from './_shared'

export const updateMyPreferences = createRoute({
  method: 'patch',
  path: '/api/me/preferences',
  operationId: 'updateMyPreferences',
  tags: ['Preferences'],
  request: { body: { content: { 'application/json': { schema: Preferences.partial() } } } },
  responses: {
    200: { description: 'The updated account preferences.', content: { 'application/json': { schema: Preferences } } },
    ...validationErrors
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})
