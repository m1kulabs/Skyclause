import { z } from '@hono/zod-openapi'
import { slugSchema } from '../../../slugs'
import { createRoute } from '../../create-route'
import { Deletion, Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const requestOrganisationDeletion = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/deletion',
  operationId: 'requestOrganisationDeletion',
  tags: ['deletion'],
  request: {
    params: OrgParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({ slug: slugSchema })
            .strict()
            .describe('Type the organisation slug to start the 30-day deletion grace period.')
        }
      }
    }
  },
  responses: {
    202: { description: 'Accepted.', content: { 'application/json': { schema: Deletion } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-data-rights', statement: 'org.delete', idempotent: false }
})
