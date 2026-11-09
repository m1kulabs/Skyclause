import { IdempotencyHeaders, ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { slugSchema } from '../../../slugs'
import { createRoute } from '../../create-route'
import { Organisation } from '../../shared'
import { Forbidden, IdempotencyMismatch, Unauthorized, ValidationFailed } from './_shared'

export const createOrganisation = createRoute({
  method: 'post',
  path: '/api/orgs',
  operationId: 'createOrganisation',
  tags: ['organisations'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ name: z.string().min(1), slug: slugSchema }).strict() } }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Organisation } } },
    401: Unauthorized,
    403: Forbidden,
    400: ValidationFailed,
    422: IdempotencyMismatch,
    409: { description: 'slug-reserved or slug-taken: the organisation slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'a-org-projects', statement: 'session', idempotent: true }
})
