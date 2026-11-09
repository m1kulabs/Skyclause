import { UuidIdParams as IdParams } from '../../common'
import { z } from '@hono/zod-openapi'
import { Verdicts } from '../../shared'
import { Clause, SheetInput } from '../../../clauses'

export const VersionParams = IdParams.extend({ n: z.coerce.number().int().positive() })

export const DraftParams = IdParams.extend({ draftId: IdParams.shape.id })

export const CheckIssue = z.object({
  clause_key: z.string().nullable(),
  message: z.string(),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative()
})

export const CheckResult = z.object({ ok: z.boolean(), publishable: z.boolean(), issues: z.array(CheckIssue) })

export const SheetContentBody = z.object({ content: SheetInput })

export const SheetDiffEntry = z.object({ key: z.string(), before: Clause.nullable(), after: Clause.nullable() })

export const ReplayResult = z.object({
  id: z.uuidv7(),
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: z.iso.datetime(), verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})

export const ReplayRequest = z.object({
  version_id: z.uuidv7(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  step: z.string().regex(/^(reading|PT\d+M)$/),
  dataset_id: z.string().optional()
})
