import { problemResponse, OrganizationHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Clause } from '../../../clauses'
import { InputValue, Pack } from '../../shared'
import { typeErrorSchema } from './_shared'

export const evaluateSandbox = createRoute({
  method: 'post',
  path: '/v1/sandbox/evaluate',
  operationId: 'evaluateSandbox',
  tags: ['Sandbox'],
  request: {
    headers: OrganizationHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ pack: Pack, clause: Clause, replay_id: z.string().optional() })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Clause evaluation against live Commons indicators or a labelled replay.',
      content: {
        'application/json': {
          schema: z.object({
            evaluated_at: z.iso.datetime(),
            source: z.enum(['live', 'replay']),
            result: z.boolean().nullable(),
            type_errors: z.array(typeErrorSchema),
            inputs: z.array(InputValue)
          })
        }
      }
    },
    400: problemResponse('The organisation header or request is invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The caller lacks project view permission.'),
    404: problemResponse('The organisation or replay was not found.'),
    422: problemResponse('The clause could not be evaluated.')
  },
  x: { owner: 'e-console-api', statement: 'project.view', idempotent: false }
})
