import { IdempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { ApiKey } from '../../shared'
import {
  ApiKeyScopes,
  Forbidden,
  IdempotencyMismatch,
  NotFound,
  OrgParams,
  Unauthorized,
  ValidationFailed
} from './_shared'

export const createOrganisationApiKey = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/api-keys',
  operationId: 'createOrganisationApiKey',
  tags: ['api-keys'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: ApiKey.pick({ name: true, expires_at: true })
            .extend({ scopes: ApiKeyScopes })
            .describe('Expiry must be no more than 365 days after creation.')
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created.',
      content: {
        'application/json': {
          schema: ApiKey.extend({ key: z.string().describe('Shown only in the creation response.') })
        }
      }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: true }
})
