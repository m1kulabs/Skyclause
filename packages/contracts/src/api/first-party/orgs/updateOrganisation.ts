import { ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { slugSchema } from '../../../slugs'
import { createRoute } from '../../create-route'
import { Organisation } from '../../shared'
import { Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const updateOrganisation = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}',
  operationId: 'updateOrganisation',
  tags: ['organisations'],
  request: {
    params: OrgParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ name: z.string().min(1).optional(), slug: slugSchema.optional() }).strict()
        }
      }
    }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Organisation } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    409: { description: 'slug-reserved or slug-taken: the organisation slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'a-org-projects', statement: 'org.manage', idempotent: false }
})
