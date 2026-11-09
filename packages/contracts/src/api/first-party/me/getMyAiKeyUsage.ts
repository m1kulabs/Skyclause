import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { createRoute } from '../../create-route'
import { aiKeyUsageSummary } from './_shared'

export const getMyAiKeyUsage = createRoute({
  method: 'get',
  path: '/api/me/ai-keys/usage',
  operationId: 'getMyAiKeyUsage',
  tags: ['AI Keys'],
  responses: {
    200: {
      description: 'Monthly personal AI key usage totals.',
      content: { 'application/json': { schema: aiKeyUsageSummary } }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})
