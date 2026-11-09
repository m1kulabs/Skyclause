import { JsonValue } from '../../common'
import { z } from '@hono/zod-openapi'
import { CallView, EvidenceRequest, Grade, Instant, LedgerEntry, Reading, Source } from '../../shared'

// LED-5: each quoted reading, warning and retained frame keeps its stored reading ID.
export const EvidencePack = z.object({
  project_id: z.string(),
  window_id: z.string().nullable(),
  readings: z.array(
    Reading.extend({
      value_json: JsonValue.nullable(),
      station_id: Source.shape.external_id,
      source_url: Source.shape.url
    })
  ),
  warnings: z.array(
    z.object({
      reading_id: z.string(),
      text: z.string(),
      gloss: z.string().nullable(),
      valid_from: Instant,
      valid_to: Instant
    })
  ),
  calls: z.array(CallView),
  approvals: z.array(
    z.object({ id: z.string(), call_id: z.string().nullable(), approved_by: z.string(), approved_at: Instant })
  ),
  grades: z.array(Grade),
  ledger: z.array(LedgerEntry.extend({ body: JsonValue })),
  frames: z.array(z.object({ reading_id: z.string(), url: z.url(), captured_at: Instant }))
})

export const EvidenceRequestView = EvidenceRequest.extend({ pack: EvidencePack.nullable() })

// Requester, via, organisation and leaves_org are resolved from the principal, never supplied by a body.
export const EvidenceRequestInput = EvidenceRequest.pick({ span: true, call_id: true })
  .partial()
  .extend({ window_id: z.string().optional() })
  .refine((value) => value.span !== undefined || value.call_id != null || value.window_id !== undefined, {
    message: 'Provide a span, call_id or window_id'
  })
