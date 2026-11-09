import { z } from '@hono/zod-openapi'
import {
  CallView,
  CallState,
  ClauseExplanation,
  Grade,
  InputValue,
  Instant,
  LocalDate,
  Mode,
  Night,
  Pack,
  PageQuery,
  RecipientCounts,
  Window
} from '../../shared'

// CAL-13 and CAL-16: retain the inputs as read, the published clause version, and the agent trace.
export const Warning = z.object({
  reading_id: z.string(),
  text: z.string(),
  gloss: z.string().nullable(),
  valid_from: Instant,
  valid_to: Instant
})

export const CallExplanation = z.object({
  call_id: z.string(),
  sheet_version_id: z.string(),
  clauses: z.array(ClauseExplanation),
  inputs: z.array(InputValue),
  warnings: z.array(Warning),
  trace: z.array(
    z.object({
      step: z.string(),
      duration_ms: z.number().nonnegative(),
      inputs: z.array(InputValue),
      detail: z.string()
    })
  )
})

export const CallDetail = CallView.extend(CallExplanation.shape).extend({
  project_id: z.string(),
  window: Window.nullable(),
  night: Night.nullable(),
  approved_by: z.string().nullable(),
  grade: Grade.nullable(),
  permalink: z.url(),
  deliveries: z.array(
    z.object({
      recipient_id: z.string(),
      language: CallView.shape.notices.element.shape.language,
      status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'expired']),
      accepted_at: Instant.nullable()
    })
  ),
  // #150 (optional): the call's recipients by language, channel and suppression.
  recipient_counts: RecipientCounts.optional()
})

export const CallQuery = PageQuery.extend({
  // #150 (optional): a window's calls, for #166.
  window_id: z.string().optional(),
  pack: Pack.optional(),
  state: CallState.optional(),
  mode: Mode.optional(),
  from: LocalDate.optional(),
  to: LocalDate.optional()
})
