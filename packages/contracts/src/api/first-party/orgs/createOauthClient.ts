import { IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import {
  Forbidden,
  IdempotencyMismatch,
  NotFound,
  OAuthClient,
  OAuthClientInput,
  OrgParams,
  Unauthorized,
  ValidationFailed
} from './_shared'

export const createOauthClient = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/oauth-clients',
  operationId: 'createOauthClient',
  tags: ['oauth-clients'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: OAuthClientInput } } }
  },
  responses: {
    201: {
      description: 'Created.',
      content: {
        'application/json': {
          schema: OAuthClient.extend({ client_secret: z.string().describe('Shown only in the creation response.') })
        }
      }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'e-mcp-auth', statement: 'integrations.manage', idempotent: true }
})
