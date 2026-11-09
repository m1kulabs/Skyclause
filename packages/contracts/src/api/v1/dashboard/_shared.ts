import { z } from '@hono/zod-openapi'
import { Grade, Instant, LocalDate, Mode, Pack, ProjectRef, Source, SourceState, Verdict, Window } from '../../shared'

export const dashboardBlock = <Item extends z.ZodType>(item: Item) =>
  z.object({
    data: z.array(item),
    n: z.number().int().nonnegative(),
    next_action: z.string().nullable()
  })

export const reviewBundleSchema = z.object({
  id: z.string(),
  project: ProjectRef,
  pack: Pack,
  sla_due_at: Instant,
  seconds_remaining: z.number().int()
})

export const atRiskWindowSchema = z.object({
  project: ProjectRef,
  window: Window,
  verdict: Verdict
})

export const signalHealthSchema = z.object({
  project: ProjectRef,
  source: Source,
  state: SourceState,
  age_s: z.number().int().nonnegative().nullable()
})

export const upcomingRiskSchema = z.object({
  project: ProjectRef,
  pack: Pack,
  date: LocalDate,
  starts_at: Instant,
  mode: Mode.nullable()
})

export const yesterdayGradeSchema = z.object({ project: ProjectRef, grade: Grade })
