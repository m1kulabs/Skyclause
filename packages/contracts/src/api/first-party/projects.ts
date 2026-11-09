import { IdParams, ProblemResponse, CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { SLUG_REGEX } from '../../slugs'
import { createRoute } from '../create-route'
import { Project, ProjectPack, RotaShift } from '../shared'

const RotaOverride = z.array(RotaShift.omit({ id: true, project_id: true })).nullable()
const ProjectSettings = Project.extend({ rota_override: RotaOverride })
const ProjectUpdate = Project.pick({
  name: true,
  time_zone: true,
  public: true,
  semester_ends_on: true,
  site_name: true,
  site_lat: true,
  site_lon: true,
  camera_day_start: true,
  camera_day_end: true,
  warning_area_terms: true
})
  .extend({
    slug: z.string().regex(SLUG_REGEX),
    packs: z
      .array(ProjectPack.pick({ pack: true, enabled: true, schedule: true, sla_s: true }))
      .describe('Currently refused with 422 validation-failed; pack settings are managed by the source-binding owner.'),
    rota_override: RotaOverride.describe(
      'Currently refused with 422 validation-failed; rota writes are not available here.'
    )
  })
  .partial()

// Changing public also requires public_pages.edit (spec §4).
export const updateProject = createRoute({
  method: 'patch',
  path: '/api/projects/{id}',
  operationId: 'updateProject',
  tags: ['projects'],
  request: { params: IdParams, body: { required: true, content: { 'application/json': { schema: ProjectUpdate } } } },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } },
    422: {
      ...ProblemResponse,
      description: 'validation-failed, including unsupported packs or rota_override writes; slug-reserved or slug-taken'
    },
    409: { ...ProblemResponse, description: 'slug-reserved, slug-taken or pack-prerequisites' }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})

export const archiveProject = createRoute({
  method: 'post',
  path: '/api/projects/{id}/archive',
  operationId: 'archiveProject',
  tags: ['projects'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})

export const restoreProject = createRoute({
  method: 'post',
  path: '/api/projects/{id}/restore',
  operationId: 'restoreProject',
  tags: ['projects'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: ProjectSettings } } }
  },
  x: { owner: 'b-projects-api', statement: 'project.manage', idempotent: false }
})

export const routes = [updateProject, archiveProject, restoreProject] as const
