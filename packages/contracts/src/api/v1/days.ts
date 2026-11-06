import { OrganizationHeaders, IdParams as ProjectParams, problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { LocalDate, Page, PageQuery } from '../shared'

const ProjectDay = z.object({
  date: LocalDate,
  reading_count: z.number().int(),
  error_count: z.number().int(),
  window_count: z.number().int(),
  storm_afternoon: z.object({ wording: z.string(), source_url: z.url() }).nullable().optional()
})

export const listProjectDays = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/days',
  operationId: 'listProjectDays',
  tags: ['Days'],
  request: { headers: OrganizationHeaders, params: ProjectParams, query: PageQuery },
  responses: {
    200: { description: 'Project day summaries', content: { 'application/json': { schema: Page(ProjectDay) } } },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    422: problemResponse('The request parameters are invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [listProjectDays] as const
