import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { LocalDate, Page, PageQuery, Problem } from '../shared'

const OrganizationHeaders = z.object({ 'Skyclause-Organization': z.string().min(1) })
const ProjectParams = z.object({ id: z.string() })
const ProjectDay = z.object({
  date: LocalDate,
  reading_count: z.number().int(),
  error_count: z.number().int(),
  window_count: z.number().int()
})

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
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
