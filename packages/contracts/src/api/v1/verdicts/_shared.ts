import { z } from '@hono/zod-openapi'
import { ClauseResult, Instant, Verdict, Verdicts } from '../../shared'

export const ClauseResultWithLastFiredAt = ClauseResult.extend({ last_fired_at: Instant.nullable() })

export const VerdictWithLastFiredAt = Verdict.extend({ clauses: z.array(ClauseResultWithLastFiredAt) })

export const VerdictsWithLastFiredAt = Verdicts.extend({
  site: z.array(VerdictWithLastFiredAt),
  windows: z.array(VerdictWithLastFiredAt),
  nights: z.array(VerdictWithLastFiredAt)
})

export const ProjectVerdicts = z.object({ project_id: z.string(), packs: z.array(VerdictsWithLastFiredAt) })
