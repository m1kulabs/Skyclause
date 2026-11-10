import type { z } from '@hono/zod-openapi'
import { HTTP_PROBLEM_STATUS, type Operations, type RecordAudit } from '@skyclause/contracts'
import {
  explainReviewItem,
  isFlagEnabled,
  listGradeRows,
  listReviewItemRows,
  pendingNights,
  projectToday,
  reviewItemTarget,
  type Tx
} from '@skyclause/db'
import { decodeCursor, page } from '../pagination'
import { ApiError } from '../problems'
import { instant } from '../serialize'
import type { ServiceContext } from '../tenancy'

// #161 c-grades: grades and review items (#79 §4: reads `ledger.view`, PATCH `bundle.approve`).

type Ok<Id extends 'listGrades' | 'listReviewItems' | 'updateReviewItem'> = z.infer<
  Operations[Id]['responses'][200]['content']['application/json']['schema']
>
type GradeView = Ok<'listGrades'>['data'][number]
type ItemView = Ok<'updateReviewItem'>
type GradeQuery = z.infer<Operations['listGrades']['request']['query']>
type Rows<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>
type GradeRow = Rows<typeof listGradeRows>[number]
type ItemRow = Rows<typeof listReviewItemRows>[number]

const notFound = () =>
  new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', 'No such review item, or you can’t explain it.')
const badCursor = () =>
  new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
    errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
  })

function baseGrade(g: GradeRow['grade']) {
  return {
    id: g.id,
    call_id: g.callId,
    night_id: g.nightId,
    outcome: g.outcome,
    sheet_version_id: g.sheetVersionId,
    pack: g.pack,
    window_id: g.windowId,
    proposed_mode: g.proposedMode,
    observed_mode: g.observedMode,
    mode_diff: g.modeDiff,
    no_call: g.noCall,
    agrees: g.agrees,
    stale_inputs: g.staleInputs
  }
}

function forecastView(f: NonNullable<GradeRow['forecast']>) {
  return {
    id: f.id,
    night_id: f.nightId,
    baseline: f.baseline,
    uplift: f.uplift,
    forecast: f.forecast,
    band_low: f.bandLow,
    band_high: f.bandHigh,
    created_at: instant(f.createdAt),
    method: f.method,
    reading_ids: f.readingIds
  }
}

const gradeView = ({ grade: g, forecast }: GradeRow): GradeView => ({
  ...baseGrade(g),
  forecast: forecast ? forecastView(forecast) : null,
  actual: g.actual,
  reading_ids: g.readingIds,
  graded_at: instant(g.createdAt),
  local_date: g.localDate
})

const itemView = ({ item, grade: g }: ItemRow): ItemView => ({
  id: item.id,
  grade_id: item.gradeId,
  state: item.state,
  explanation: item.explanation ?? '',
  reasons: item.reasons as NonNullable<ItemView['reasons']>,
  explained_by: item.explainedBy,
  explained_at: item.explainedAt ? instant(item.explainedAt) : null,
  opened_at: instant(item.createdAt),
  grade: baseGrade(g)
})

/** Newest first by local date, then ID, as the database orders grades. */
const newestFirst = (a: GradeView, b: GradeView) =>
  a.local_date! < b.local_date! ? 1 : a.local_date! > b.local_date! ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0

/**
 * The project's grades, newest first, with listed nights still waiting for their Rapid Rail file as `pending` (no row
 * exists for them: the ID is the night's, `graded_at` the read time, `pending_until` the file's next update). With
 * `pack_crowd` off, a Crowd read is 403 `feature-off` and the list holds Sky only (#79 §6).
 */
export async function listProjectGrades(
  ctx: ServiceContext,
  q: { projectId: string; orgId: string; query: GradeQuery; now: Date }
): Promise<Ok<'listGrades'>> {
  const tx = ctx.tx as Tx
  const { pack, outcome, from, to, limit, cursor } = q.query
  const crowdOn = await isFlagEnabled(tx, 'pack_crowd', q.orgId)
  if (pack === 'crowd' && !crowdOn) throw new ApiError(403, 'feature-off', 'Crowd is off for this organisation.')
  const packs: Array<'sky' | 'crowd'> = pack ? [pack] : crowdOn ? ['sky', 'crowd'] : ['sky']
  let before: { localDate: string; id: string } | undefined
  if (cursor !== undefined) {
    const { d, id } = decodeCursor(cursor)
    if (typeof d !== 'string' || typeof id !== 'string') throw badCursor()
    before = { localDate: d, id }
  }
  const graded =
    outcome === 'pending'
      ? []
      : (await listGradeRows(tx, { projectId: q.projectId, packs, outcome, from, to, before, limit: limit + 1 })).map(
          gradeView
        )
  const pending: GradeView[] = []
  if (packs.includes('crowd') && (outcome === undefined || outcome === 'pending')) {
    const today = await projectToday(tx, q.projectId, q.now)
    for (const n of await pendingNights(tx, { projectId: q.projectId, today: today! })) {
      if ((from && n.date < from) || (to && n.date > to)) continue
      if (before && (n.date > before.localDate || (n.date === before.localDate && n.id >= before.id))) continue
      pending.push({
        id: n.id,
        call_id: null,
        night_id: n.id,
        outcome: 'pending',
        sheet_version_id: n.sheetVersionId,
        pack: 'crowd',
        window_id: null,
        proposed_mode: null,
        observed_mode: null,
        mode_diff: 0,
        no_call: false,
        agrees: false,
        stale_inputs: false,
        forecast: n.forecast ? forecastView(n.forecast) : null,
        actual: null,
        reading_ids: [],
        graded_at: instant(q.now),
        local_date: n.date,
        pending_until: n.pendingUntil ? instant(n.pendingUntil) : null
      })
    }
  }
  const rows = [...graded, ...pending].sort(newestFirst).slice(0, limit + 1)
  return page(rows, limit, (row) => ({ d: row.local_date, id: row.id }))
}

/** The project's review items, newest first, each with its grade, reasons and explanation (ANL-2, ANL-4). */
export async function listProjectReviewItems(
  ctx: ServiceContext,
  q: { projectId: string; state?: string; reason?: string; limit: number; cursor?: string }
): Promise<Ok<'listReviewItems'>> {
  let beforeId: string | undefined
  if (q.cursor !== undefined) {
    const { id } = decodeCursor(q.cursor)
    if (typeof id !== 'string') throw badCursor()
    beforeId = id
  }
  const rows = await listReviewItemRows(ctx.tx as Tx, { ...q, beforeId, limit: q.limit + 1 })
  return page(rows.map(itemView), q.limit, (row) => ({ id: row.id }))
}

/**
 * Sets a review item's explanation, and who gave it when (#79 §3: the explanation alone is editable, so a `state` is
 * refused), audited as `review_item.explained` with the times only, since an explanation is free text. 404 when the
 * item is another organisation's or its project is out of the principal's reach.
 */
export async function explainProjectReviewItem(
  ctx: ServiceContext,
  q: { id: string; body: { state?: string; explanation?: string }; now: Date },
  canExplain: (projectId: string) => boolean,
  recordAudit: RecordAudit
): Promise<ItemView> {
  if (q.body.state !== undefined) {
    throw new ApiError(422, 'validation-failed', 'Only a review item’s explanation can change.', {
      errors: [{ in: 'body', pointer: '/state', detail: 'A review item’s state can’t be set' }]
    })
  }
  const tx = ctx.tx as Tx
  const target = await reviewItemTarget(tx, q.id)
  if (!target || !canExplain(target.projectId)) throw notFound()
  const accountId = 'accountId' in ctx.principal ? ctx.principal.accountId : null
  const row = await explainReviewItem(tx, { id: q.id, explanation: q.body.explanation!, accountId, at: q.now })
  await recordAudit(ctx.tx, {
    action: 'review_item.explained',
    target: { type: 'review_item', id: q.id },
    projectId: target.projectId,
    before: { explained_at: target.explainedAt ? instant(target.explainedAt) : null },
    after: { explained_at: instant(q.now) }
  })
  return itemView(row)
}
