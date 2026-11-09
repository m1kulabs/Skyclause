import { IdParams, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Incident, IncidentFields } from './_shared'

export const updateIncident = createRoute({
  method: 'patch',
  path: '/api/admin/incidents/{id}',
  operationId: 'updateIncident',
  tags: ['admin'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: IncidentFields.partial().extend({
            status: z.string(),
            body: z.string(),
            resolved: z.boolean().optional()
          })
        }
      }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Incident update appended', content: { 'application/json': { schema: Incident } } }
  },
  x: { owner: 'd-public-api', statement: 'staff', idempotent: false }
})
