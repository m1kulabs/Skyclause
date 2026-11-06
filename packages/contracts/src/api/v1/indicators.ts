import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Forecast, InputValue, Instant, Night, Pack, Problem, SourceState } from '../shared'

const OrganizationHeaders = z.object({ 'Skyclause-Organization': z.string().min(1) })
const ProjectParams = z.object({ id: z.string() })
const IndicatorQuery = z.object({ pack: Pack })
const IndicatorSourceState = SourceState.extend({
  source_id: z.string(),
  age_s: z.number().int().nonnegative().nullable()
})
const IndicatorNight = z.object({
  night: Night,
  forecast: Forecast.nullable(),
  single_source: z.boolean()
})
const IndicatorSnapshot = z.object({
  project_id: z.string(),
  pack: Pack,
  t_eval: Instant,
  inputs: z.array(IndicatorSourceState),
  site: z.record(z.string(), InputValue),
  series: z.record(z.string(), z.array(z.tuple([Instant, z.number().nullable(), z.string()]))),
  nights: z.array(IndicatorNight),
  registry_hash: z.string(),
  hash: z.string()
})

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

export const getProjectIndicators = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/indicators',
  operationId: 'getProjectIndicators',
  tags: ['Indicators'],
  request: { headers: OrganizationHeaders, params: ProjectParams, query: IndicatorQuery },
  responses: {
    200: {
      description: 'Latest indicator snapshot for the selected pack',
      content: { 'application/json': { schema: IndicatorSnapshot } }
    },
    400: problemResponse('The organization header is missing or invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal lacks project.view permission.'),
    404: problemResponse('The project is unavailable in this organization.'),
    422: problemResponse('The pack parameter is invalid.'),
    429: problemResponse('The request rate limit was exceeded.')
  },
  x: { owner: 'b-signals-api', statement: 'project.view', idempotent: false }
})

export const routes = [getProjectIndicators] as const
