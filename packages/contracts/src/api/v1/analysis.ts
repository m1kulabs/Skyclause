import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { AnalysisMetric, Grade, Instant, LocalDate, Pack, Page, PageQuery, Problem, Verdicts } from '../shared'
import { SheetInput } from '../../clauses'

// D2: sessions select an organisation by slug or ID; scoped keys and grants already carry it.
const OrganizationHeaders = z.object({
  'Skyclause-Organization': z.string().min(1).optional().describe('Required for sessions; organisation slug or ID')
})
const IdParams = z.object({ id: z.string().min(1) })
const ProblemResponses = {
  400: {
    description: 'organization-required or validation-failed.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  401: { description: 'Authentication required.', content: { 'application/problem+json': { schema: Problem } } },
  403: {
    description: 'insufficient-scope: permission denied.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  404: {
    description: 'Resource not found, including a row in another organisation.',
    content: { 'application/problem+json': { schema: Problem } }
  },
  429: {
    description: 'rate-limited or budget-exhausted.',
    headers: z.object({ 'Retry-After': z.string().regex(/^\d+$/).describe('Retry delay in seconds') }),
    content: { 'application/problem+json': { schema: Problem } }
  }
}

// ANL-5: the same metrics power project and organisation views; n=0 keeps null intervals.
const ScopedMetric = AnalysisMetric.extend({ pack: Pack, clause_key: z.string().nullable() })
const AnalysisQuery = PageQuery.extend({ from: LocalDate.optional(), to: LocalDate.optional(), pack: Pack.optional() })
const Analysis = z.object({
  from: LocalDate,
  to: LocalDate,
  updated_at: Instant,
  metrics: z.array(ScopedMetric),
  series: z.array(z.object({ at: Instant, metrics: z.array(ScopedMetric) })),
  grades: Page(Grade),
  kill_line_exceeded: z.boolean()
})
const ReplayRange = z.object({
  from: Instant,
  to: Instant,
  step: z.union([z.literal('reading'), z.string().regex(/^PT[1-9]\d*M$/)])
})
// Spec §1 replay result, converted to snake_case; never added to live analysis.
const WhatIfReplay = z.object({
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: Instant, verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})

export const getProjectAnalysis = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/analysis',
  operationId: 'getProjectAnalysis',
  tags: ['analysis'],
  request: { headers: OrganizationHeaders, params: IdParams, query: AnalysisQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Analysis } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})

export const getOrganisationAnalysis = createRoute({
  method: 'get',
  path: '/v1/analysis',
  operationId: 'getOrganisationAnalysis',
  tags: ['analysis'],
  request: { headers: OrganizationHeaders, query: AnalysisQuery },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: Analysis } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})

export const evaluateWhatIf = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/analysis/what-if',
  operationId: 'evaluateWhatIf',
  tags: ['analysis'],
  request: {
    headers: OrganizationHeaders,
    params: IdParams,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ sheet: SheetInput, range: ReplayRange }) } }
    }
  },
  responses: {
    ...ProblemResponses,
    200: { description: 'Success', content: { 'application/json': { schema: WhatIfReplay } } }
  },
  x: { owner: 'c-analysis-api', statement: 'ledger.view', idempotent: false }
})

export const routes = [getProjectAnalysis, getOrganisationAnalysis, evaluateWhatIf] as const
