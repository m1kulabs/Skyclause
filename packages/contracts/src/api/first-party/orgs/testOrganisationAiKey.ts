import { ProblemContent as JsonProblem } from '../../common'
import { createRoute } from '../../create-route'
import { Forbidden, KeyTestResult, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const testOrganisationAiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ai-keys/{id}/test',
  operationId: 'testOrganisationAiKey',
  tags: ['ai-keys'],
  request: { params: OrgItemParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: KeyTestResult } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    422: { description: 'key-test-failed: the minimal provider call failed.', content: JsonProblem }
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
