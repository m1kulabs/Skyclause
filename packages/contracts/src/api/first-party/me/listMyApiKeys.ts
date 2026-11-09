import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { ApiKey, Page, PageQuery } from '../../shared'

export const listMyApiKeys = createRoute({
  method: 'get',
  path: '/api/me/api-keys',
  operationId: 'listMyApiKeys',
  tags: ['API Keys'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s API keys.',
      content: { 'application/json': { schema: Page(ApiKey) } }
    },
    ...sessionErrors,
    403: problemResponse('The session cannot manage API keys.')
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})
