import { IdempotencyHeaders, ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { SLUG_REGEX } from '../../../slugs'
import { createRoute } from '../../create-route'
import { Pack, Project } from '../../shared'
import { Forbidden, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const createProject = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/projects',
  operationId: 'createProject',
  tags: ['projects'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              name: z.string().min(1),
              slug: z.string().regex(SLUG_REGEX),
              site_name: z.string().min(1),
              site_lat: z.number(),
              site_lon: z.number(),
              time_zone: Project.shape.time_zone.default('Asia/Kuala_Lumpur'),
              packs: z.array(Pack).min(1),
              semester_ends_on: Project.shape.semester_ends_on.optional(),
              camera_day_start: Project.shape.camera_day_start.optional(),
              camera_day_end: Project.shape.camera_day_end.optional(),
              warning_area_terms: Project.shape.warning_area_terms.optional()
            })
            .strict()
        }
      }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Project } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: {
      description:
        'validation-failed, idempotency-mismatch, slug-reserved, slug-taken or pack-prerequisites: Crowd needs a venue and rail station.',
      content: JsonProblem
    },
    409: { description: 'slug-reserved or slug-taken: the project slug is unavailable.', content: JsonProblem }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: true }
})
