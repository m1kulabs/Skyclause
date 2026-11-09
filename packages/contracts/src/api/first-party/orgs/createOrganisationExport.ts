import { IdempotencyHeaders, ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import {
  Forbidden,
  IdempotencyMismatch,
  NotFound,
  OrgParams,
  OrganisationExport,
  Unauthorized,
  ValidationFailed
} from './_shared'

export const createOrganisationExport = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/exports',
  operationId: 'createOrganisationExport',
  tags: ['exports'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ formats: z.array(z.enum(['json', 'csv'])).min(1) }) } }
    }
  },
  responses: {
    202: { description: 'Accepted.', content: { 'application/json': { schema: OrganisationExport } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch,
    409: { description: 'export-pending: an export is already being prepared.', content: JsonProblem }
  },
  x: { owner: 'a-data-rights', statement: 'org.export', idempotent: true }
})
