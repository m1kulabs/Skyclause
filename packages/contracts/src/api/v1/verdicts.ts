import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { ClauseResult, Instant, Problem, Verdict, Verdicts } from '../shared'

const OrganizationHeaders = z.object({ 'Skyclause-Organization': z.string().min(1) })
const ProjectParams = z.object({ id: z.string() })
const ClauseResultWithLastFiredAt = ClauseResult.extend({ last_fired_at: Instant.nullable() })
const VerdictWithLastFiredAt = Verdict.extend({ clauses: z.array(ClauseResultWithLastFiredAt) })
const VerdictsWithLastFiredAt = Verdicts.extend({
  site: z.array(VerdictWithLastFiredAt),
  windows: z.array(VerdictWithLastFiredAt),
  nights: z.array(VerdictWithLastFiredAt)
})
const ProjectVerdicts = z.object({ project_id: z.string(), packs: z.array(VerdictsWithLastFiredAt) })

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

export const getProjectVerdicts = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/verdicts',
  operationId: 'getProjectVerdicts',
  tags: ['Verdicts'],
  request: { headers: OrganizationHeaders, params: ProjectParams },
  responses: {
    200: {
      description: 'Latest verdicts for each enabled pack',
      content: { 'application/json': { schema: ProjectVerdicts } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [getProjectVerdicts] as const
