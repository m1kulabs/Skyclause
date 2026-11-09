import { z } from '@hono/zod-openapi'
import { ROLES } from '../../../auth'
import {
  AnalysisMetric,
  Grade,
  InputValue,
  Instant,
  LedgerEntry,
  LocalDate,
  Mode,
  Pack,
  PublicProjectState,
  Verdicts
} from '../../shared'

export const orgProjectParams = z.object({ org: z.string().min(1), project: z.string().min(1) })

export const publicCallSchema = z.object({
  id: z.string(),
  pack: Pack,
  state: z.enum(['approved', 'sent']),
  mode: Mode.nullable(),
  watch: z.boolean(),
  window: z.object({ starts_at: Instant, ends_at: Instant }).nullable(),
  fired: z.array(z.object({ clause: z.string(), inputs: z.array(InputValue) })),
  approver_role: z.enum(ROLES),
  approval_delay_s: z.number().int().nonnegative(),
  clause_version_n: z.number().int().nonnegative(),
  approved_at: Instant,
  sent_at: Instant.nullable(),
  grade: Grade.nullable()
})

export const publicCalendarEntrySchema = z.object({
  id: z.string(),
  call_id: z.string(),
  pack: Pack,
  kind: z.enum(['class', 'event', 'commute_wave']),
  starts_at: Instant,
  ends_at: Instant,
  mode: Mode.nullable(),
  watch: z.boolean(),
  permalink: z.string()
})

export const publicLedgerEntrySchema = LedgerEntry.pick({
  id: true,
  project_id: true,
  seq: true,
  kind: true,
  refs: true,
  prev_hash: true,
  hash: true,
  at: true,
  corrects: true
}).extend({ derived_values: z.array(InputValue) })

export const publicGradeMetricSchema = AnalysisMetric.extend({ pack: Pack })

export const publicProjectStatusSchema = PublicProjectState.extend({
  verdicts: z.array(Verdicts),
  strip: z.array(InputValue)
})

export const publicServiceStatusSchema = z.object({
  components: z.array(
    z.object({
      scope: z.enum(['ours', 'source']),
      component: z.string(),
      source_id: z.string().nullable(),
      ok: z.boolean(),
      checked_at: Instant
    })
  ),
  incidents: z.array(
    z.object({
      id: z.string(),
      scope: z.enum(['ours', 'source']),
      component: z.string(),
      source_id: z.string().nullable(),
      status: z.string(),
      body: z.string(),
      created_at: Instant,
      resolved_at: Instant.nullable()
    })
  )
})

export const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

export const publicEvaluationRequestSchema = z.object({ date: LocalDate, start_time: localTime, end_time: localTime })

export const publicEvaluationResponseSchema = z.object({
  label: z.literal('Clause engine verdict: not reviewed, not sent'),
  evaluated_at: Instant,
  verdicts: z.array(Verdicts),
  strip: z.array(InputValue)
})

export const publicStateEventSchema = z.object({
  event: z.literal('state'),
  data: z.object({ state_version: z.string() })
})
