import { OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Bundle, InputState, LocalDate, Night, PackState, Page, PageQuery, Project } from '../shared'

const ProjectSummary = z.object({
  pack_states: z.array(PackState),
  windows_at_risk: z.number().int(),
  signal_health: z.object({
    state: InputState,
    inputs_reporting: z.number().int(),
    oldest_age_s: z.number().int().nonnegative().nullable()
  }),
  latest_bundle: Bundle.nullable(),
  next_night: Night.nullable(),
  next_storm_date: LocalDate.nullable(),
  next_action: z.enum(['bind_source', 'declare_window']).nullable()
})
const ProjectListItem = Project.extend({ summary: ProjectSummary.optional() })
const ProjectListQuery = z.object({
  ...PageQuery.shape,
  slug: z.string().optional(),
  include: z.enum(['summary']).optional()
})

const organizationErrors = {
  400: problemResponse('The organization header is missing or invalid.'),
  401: problemResponse('Authentication is required.'),
  403: problemResponse('The principal lacks project.view permission.'),
  404: problemResponse('The project is unavailable in this organization.'),
  422: problemResponse('The request parameters are invalid.'),
  429: problemResponse('The request rate limit was exceeded.')
}

export const listProjects = createRoute({
  method: 'get',
  path: '/v1/projects',
  operationId: 'listProjects',
  tags: ['Projects'],
  request: { headers: OrganizationHeaders, query: ProjectListQuery },
  responses: {
    200: {
      description: 'Projects visible in the selected organization',
      content: { 'application/json': { schema: Page(ProjectListItem) } }
    },
    ...organizationErrors
  },
  x: { owner: 'b-projects-api', statement: 'project.view', idempotent: false }
})

export const getProject = createRoute({
  method: 'get',
  path: '/v1/projects/{id}',
  operationId: 'getProject',
  tags: ['Projects'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: { description: 'Project details', content: { 'application/json': { schema: Project } } },
    ...organizationErrors
  },
  x: { owner: 'b-projects-api', statement: 'project.view', idempotent: false }
})

export const routes = [listProjects, getProject] as const
