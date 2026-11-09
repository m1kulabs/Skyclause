import { JsonValue } from '../../common'
import { z } from '@hono/zod-openapi'
import {
  CallState,
  CallView,
  Grade,
  Instant,
  LedgerEntry,
  LedgerKind,
  LocalDate,
  Mode,
  Pack,
  Page,
  Window
} from '../../shared'
import { ROLES } from '../../../auth'

// LED-7: both the list and CSV export accept the screen's URL filters.
export const LedgerFilters = z.object({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  pack: Pack.optional(),
  mode: Mode.optional(),
  state: CallState.optional(),
  kind: LedgerKind.optional()
})

export const LedgerRow = LedgerEntry.extend({
  body: JsonValue,
  pack: Pack.nullable(),
  call: CallView.nullable(),
  window: Window.nullable(),
  grade: Grade.nullable(),
  approver_role: z.enum(ROLES).nullable()
})

export const LedgerPage = Page(LedgerRow).extend({ total: z.number().int().nonnegative() })

export const LedgerVerification = z.object({
  valid: z.boolean(),
  checked_entries: z.number().int().nonnegative(),
  first_bad_entry_id: z.string().nullable(),
  head_hash: z.string(),
  verified_at: Instant,
  // #146: the first bad entry's `seq` and why it broke the chain.
  first_bad: z
    .object({ id: z.string(), seq: z.number().int(), reason: z.enum(['seq_gap', 'prev_hash', 'hash']) })
    .optional()
})
