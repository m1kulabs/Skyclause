import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { aiKeyWithTestResult } from './_shared'

export const listMyAiKeys = createRoute({
  method: 'get',
  path: '/api/me/ai-keys',
  operationId: 'listMyAiKeys',
  tags: ['AI Keys'],
  request: { query: PageQuery },
  responses: {
    200: {
      description: 'The signed-in account’s AI keys, without saved secrets.',
      content: { 'application/json': { schema: Page(aiKeyWithTestResult) } }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})
