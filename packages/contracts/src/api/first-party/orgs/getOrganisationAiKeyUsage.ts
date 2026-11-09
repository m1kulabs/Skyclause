import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { AiUsage, Page, PageQuery } from '../../shared'
import { Forbidden, Id, NotFound, OrgParams, Unauthorized, UsageMonth, ValidationFailed } from './_shared'

export const getOrganisationAiKeyUsage = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/ai-keys/usage',
  operationId: 'getOrganisationAiKeyUsage',
  tags: ['ai-keys'],
  request: { params: OrgParams, query: PageQuery.extend({ month: UsageMonth.optional(), key_id: Id.optional() }) },
  responses: {
    200: {
      description: 'Success.',
      content: { 'application/json': { schema: Page(AiUsage.extend({ estimated_cost: z.number().nonnegative() })) } }
    },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'e-byok-api', statement: 'ai_keys.manage', idempotent: false }
})
