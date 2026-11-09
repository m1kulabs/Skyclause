import { z } from '@hono/zod-openapi'
import { AnalysisMetric, Grade, Instant, LocalDate, Pack, Page, PageQuery, Verdicts } from '../../shared'

// ANL-5: the same metrics power project and organisation views; n=0 keeps null intervals.
export const ScopedMetric = AnalysisMetric.extend({ pack: Pack, clause_key: z.string().nullable() })

export const AnalysisQuery = PageQuery.extend({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  pack: Pack.optional(),
  period: z.enum(['7d', '30d', '90d', 'all']).optional()
})

export const Analysis = z.object({
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

export const ReplayRange = z.object({
  from: Instant,
  to: Instant,
  step: z.union([z.literal('reading'), z.string().regex(/^PT[1-9]\d*M$/)])
})

// Spec §1 replay result, converted to snake_case; never added to live analysis.
export const WhatIfReplay = z.object({
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: Instant, verdicts: Verdicts })),
  summary: z.record(z.string(), z.number()),
  metrics: z.array(ScopedMetric).optional()
})
