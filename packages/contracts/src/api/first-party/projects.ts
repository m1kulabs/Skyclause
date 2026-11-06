import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Project, ProjectPack, RotaShift, Problem } from '../shared'

const IdParams = z.object({ id: z.string() })
const RotaOverride = z.array(RotaShift.omit({ id: true, project_id: true })).nullable()
const ProjectSettings = Project.extend({ rota_override: RotaOverride })
const ProjectUpdate = Project.pick({
  name: true,
  slug: true,
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
    packs: z.array(ProjectPack.pick({ pack: true, enabled: true, schedule: true, sla_s: true })),
    rota_override: RotaOverride
  })
  .partial()

const ProblemResponse = { description: 'Request failed', content: { 'application/problem+json': { schema: Problem } } }
const CommonProblems = {
  401: { ...ProblemResponse, description: 'Authentication required' },
  403: { ...ProblemResponse, description: 'insufficient-scope' },
  404: { ...ProblemResponse, description: 'Resource not found or inaccessible' },
  422: { ...ProblemResponse, description: 'validation-failed or idempotency-mismatch' },
  429: {
    ...ProblemResponse,
    description: 'rate-limited',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/) })
  }
}

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
