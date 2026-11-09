import { z } from '@hono/zod-openapi'
import { Instant, SheetVersion, Verdict } from '../../shared'
import { Clause } from '../../../clauses'

export const PublishSelection = z.object({ draft_id: z.string() })

export const PublishedSheetVersion = SheetVersion.extend({ published_at: Instant.nullable() })

export const PublishPreview = z.object({
  draft: PublishedSheetVersion,
  live: PublishedSheetVersion.nullable(),
  preview_hash: z.string(),
  publishable: z.boolean(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
  diff: z.array(z.object({ clause_key: z.string(), before: Clause.nullable(), after: Clause.nullable() })),
  replay: z.object({
    label: z.literal('replay'),
    from: Instant,
    to: Instant,
    calls_evaluated: z.number().int().nonnegative(),
    calls_changed: z.number().int().nonnegative(),
    changes: z.array(z.object({ call_id: z.string(), before: Verdict, after: Verdict }))
  })
})
