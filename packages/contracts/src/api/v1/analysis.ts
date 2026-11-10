import {
  ScopedOrganizationHeaders as OrganizationHeaders,
  NonEmptyIdParams as IdParams,
  ProblemResponses
} from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { AnalysisMetric, Grade, Instant, LocalDate, Pack, Page, PageQuery, Verdicts } from '../shared'
import { SheetInput } from '../../clauses'

// ANL-5: the same metrics power project and organisation views; n=0 keeps null intervals.
const ScopedMetric = AnalysisMetric.extend({ pack: Pack, clause_key: z.string().nullable() })
const AnalysisQuery = PageQuery.extend({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  pack: Pack.optional(),
  period: z.enum(['7d', '30d', '90d', 'all']).optional()
})
const Analysis = z.object({
  from: LocalDate,
  to: LocalDate,
  updated_at: Instant,
  metrics: z.array(ScopedMetric),
  series: z.array(z.object({ at: Instant, metrics: z.array(ScopedMetric) })),
  grades: Page(Grade),
  kill_line_exceeded: z.boolean(),
  // #162: LED-6's evidence-assembly minutes at p50 and p95; an evidence request belongs to no pack.
  evidence_minutes: z.array(AnalysisMetric).optional()
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
  summary: z.record(z.string(), z.number()),
  metrics: z.array(ScopedMetric).optional()
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
