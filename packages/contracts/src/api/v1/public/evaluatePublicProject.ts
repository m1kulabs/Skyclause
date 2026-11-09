import { problemResponse } from '../../common'
import { createRoute } from '../../create-route'
import { orgProjectParams, publicEvaluationRequestSchema, publicEvaluationResponseSchema } from './_shared'

export const evaluatePublicProject = createRoute({
  method: 'post',
  path: '/v1/public/{org}/{project}/evaluate',
  operationId: 'evaluatePublicProject',
  tags: ['Public project'],
  request: {
    params: orgProjectParams,
    body: {
      required: true,
      content: { 'application/json': { schema: publicEvaluationRequestSchema } }
    }
  },
  responses: {
    200: {
      description: 'Derived-only clause engine verdicts and input strip for a requested local window.',
      content: { 'application/json': { schema: publicEvaluationResponseSchema } }
    },
    400: problemResponse('The requested date or local times are invalid.'),
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-commons', statement: 'public', idempotent: false }
})
