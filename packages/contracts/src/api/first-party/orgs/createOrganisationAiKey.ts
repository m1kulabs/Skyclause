import { IdempotencyHeaders, ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { AiKey } from '../../shared'
import { Forbidden, NotFound, OrgParams, OrganisationAiKey, Unauthorized, ValidationFailed } from './_shared'

export const createOrganisationAiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ai-keys',
  operationId: 'createOrganisationAiKey',
  tags: ['ai-keys'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AiKey.pick({
            provider: true,
            model: true,
            enabled: true,
            declared_tier: true,
            priority: true
          }).extend({ key: z.string().min(1).meta({ writeOnly: true }) })
        }
      }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: OrganisationAiKey } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: {
      description: 'validation-failed, idempotency-mismatch or key-test-failed: a failing key cannot be enabled.',
      content: JsonProblem
    }
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: true }
})
