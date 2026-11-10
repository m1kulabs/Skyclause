import { IdParams, ProblemResponse, ReauthProblems as CommonProblems, IdempotencyHeaders } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, DraftSheetVersion, PublishedSheetVersion, Verdict } from '../shared'
import { Clause } from '../../clauses'

const PublishSelection = z.object({ draft_id: z.uuidv7() })
const PublishPreview = z.object({
  draft: DraftSheetVersion,
  live: PublishedSheetVersion.nullable(),
  base_n: z.number().int().nonnegative(),
  live_n: z.number().int().positive().nullable(),
  base_drift: z.boolean(),
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

export const getClauseSheetPublishPreview = createRoute({
  method: 'get',
  path: '/api/clause-sheets/{id}/publish-preview',
  operationId: 'getClauseSheetPublishPreview',
  tags: ['clause-sheets'],
  request: { params: IdParams, query: PublishSelection },
  responses: {
    ...CommonProblems,
    501: { ...ProblemResponse, description: 'not-built: an authoritative publication dependency is unavailable' },
    422: { ...ProblemResponse, description: 'not-publishable or idempotency-mismatch' },
    200: { description: 'Success', content: { 'application/json': { schema: PublishPreview } } }
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_sheet.publish', idempotent: false }
})

export const publishClauseSheet = createRoute({
  method: 'post',
  path: '/api/clause-sheets/{id}/publish',
  operationId: 'publishClauseSheet',
  tags: ['clause-sheets'],
  request: {
    params: IdParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: PublishSelection.extend({ preview_hash: z.string() }) } }
    }
  },
  responses: {
    ...CommonProblems,
    501: { ...ProblemResponse, description: 'not-built: an authoritative publication dependency is unavailable' },
    422: { ...ProblemResponse, description: 'not-publishable or idempotency-mismatch' },
    201: {
      description: 'Immutable version published',
      content: { 'application/json': { schema: PublishedSheetVersion } }
    },
    409: { ...ProblemResponse, description: 'preview-stale: reload the diff and replay' }
  },
  x: { owner: 'b-clause-sheets-api', statement: 'clause_sheet.publish', idempotent: true }
})

export const routes = [getClauseSheetPublishPreview, publishClauseSheet] as const
