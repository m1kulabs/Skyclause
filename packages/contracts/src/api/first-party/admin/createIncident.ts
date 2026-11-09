import { IdempotencyHeaders, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Incident, IncidentFields } from './_shared'

export const createIncident = createRoute({
  method: 'post',
  path: '/api/admin/incidents',
  operationId: 'createIncident',
  tags: ['admin'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: IncidentFields.extend({ status: z.string(), body: z.string() }) } }
    }
  },
  responses: {
    ...CommonProblems,
    201: { description: 'Incident created', content: { 'application/json': { schema: Incident } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: true }
})
