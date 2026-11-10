import {
  canonicalHash,
  diff,
  evaluate,
  explain,
  snapshotAt,
  type Window,
  type IndicatorSnapshot,
  type SheetInput as RawSheet
} from '@skyclause/clauses'
import {
  SheetInput,
  type Can,
  type ClauseSheet,
  type Page,
  type PageQuery,
  type SheetVersion,
  type Statement
} from '@skyclause/contracts'
import {
  appendLedger,
  clauseSheetPage,
  currentSheetWindows,
  deleteDraft,
  draftById,
  emitEvent,
  FrozenWindows,
  getProjectRecord,
  insertDraft,
  liveSheetVersion,
  promoteDraft,
  publishedSheetVersionById,
  recordAudit,
  saveSheetPreview,
  sheetById,
  sheetVersionPage,
  StoredSnapshot,
  track,
  versionByN,
  type SavedValidation,
  type SheetRow
} from '@skyclause/db'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'
import { buildPublishPreview, PreviewEnvelope, previewHash } from './preview'
import {
  checkedValidation,
  clauseSheetPorts,
  dependency,
  loadRegistry,
  notPublishable,
  requireChecked,
  unavailable
} from './ports'
import {
  checkView,
  explanationsView,
  sheetView,
  verdictsView,
  versionView,
  type DiffInput,
  type EvaluateInput,
  type EvaluateView,
  type OperationResponse,
  type PreviewInput,
  type PublishInput,
  type PublishedVersionView,
  type PublishPreviewView
} from './serialize'

export { setClauseSheetPorts, type ClauseSheetPorts, type RuntimeIndicatorRegistry } from './ports'
export type { EvaluateView, PublishPreviewView, PublishedVersionView } from './serialize'
export type ClauseSheetAccess = { can: Can; now: Date }
const notFound = () => new ApiError(404, 'not-found', 'No clause sheet or selected version with this ID.')
const forbidden = () => new ApiError(403, 'insufficient-scope', 'This operation is not permitted for this principal.')
const stale = () => new ApiError(409, 'preview-stale', 'Reload the draft diff and replay before publishing.')
function authorize(ctx: ServiceContext, input: ClauseSheetAccess, projectId: string, statement: Statement) {
  const p = ctx.principal
  if (
    (p.kind === 'oauth' && p.projectIds !== 'all' && !p.projectIds.includes(projectId)) ||
    (p.kind === 'share_link' && p.projectId !== projectId)
  )
    throw notFound()
  if (!input.can(p, statement, { projectId })) throw forbidden()
  if (statement === 'clause_draft.edit') {
    if (
      p.kind === 'oauth' ||
      p.kind === 'guest_token' ||
      p.kind === 'share_link' ||
      p.kind === 'device' ||
      p.kind === 'system' ||
      (p.kind === 'session' && (p.isGuest || !p.role || !['owner', 'admin', 'approver', 'editor'].includes(p.role))) ||
      (p.kind === 'api_key' &&
        (!p.scopes.includes('admin') || !['owner', 'admin', 'approver', 'editor'].includes(p.role)))
    )
      throw forbidden()
  }
}
function human(
  ctx: ServiceContext,
  input: ClauseSheetAccess
): Extract<ServiceContext['principal'], { kind: 'session' }> {
  const p = ctx.principal
  if (p.kind !== 'session' || p.isGuest || !p.role || !['owner', 'admin', 'approver'].includes(p.role))
    throw forbidden()
  if (input.now.getTime() - p.authenticatedAt.getTime() > 12 * 3600000)
    throw new ApiError(401, 'reauth-required', 'Sign in again: publication needs a sign-in within 12 hours.')
  return p
}
async function resolve(
  ctx: ServiceContext,
  input: { id: string } & ClauseSheetAccess,
  statement: Statement,
  lock = false
): Promise<SheetRow> {
  const sheet = await sheetById(ctx.tx, input.id, lock)
  if (!sheet || !(await getProjectRecord(ctx.tx, sheet.projectId))) throw notFound()
  authorize(ctx, input, sheet.projectId, statement)
  return sheet
}
function cursor(query: PageQuery): { after?: string; limit: number } {
  if (!query.cursor) return { limit: query.limit }
  const parsed = z.object({ id: z.uuid() }).safeParse(decodeCursor(query.cursor))
  if (!parsed.success) throw new ApiError(422, 'validation-failed', 'Invalid clause sheet cursor.')
  return { after: parsed.data.id, limit: query.limit }
}
export async function listClauseSheets(
  ctx: ServiceContext,
  input: { projectId: string; query: PageQuery } & ClauseSheetAccess
): Promise<Page<ClauseSheet>> {
  if (!(await getProjectRecord(ctx.tx, input.projectId))) throw notFound()
  authorize(ctx, input, input.projectId, 'project.view')
  const rows = await clauseSheetPage(ctx.tx, { projectId: input.projectId, ...cursor(input.query) })
  return page(rows.map(sheetView), input.query.limit, (r) => ({ id: r.id }))
}
export async function listClauseSheetVersions(
  ctx: ServiceContext,
  input: { id: string; query: PageQuery } & ClauseSheetAccess
): Promise<Page<SheetVersion>> {
  await resolve(ctx, input, 'project.view')
  const rows = await sheetVersionPage(ctx.tx, { sheetId: input.id, status: 'published', ...cursor(input.query) })
  return page(rows.map(versionView), input.query.limit, (r) => ({ id: r.id }))
}
export async function listClauseSheetDrafts(
  ctx: ServiceContext,
  input: { id: string; query: PageQuery } & ClauseSheetAccess
): Promise<Page<SheetVersion>> {
  await resolve(ctx, input, 'clause_draft.edit')
  const rows = await sheetVersionPage(ctx.tx, { sheetId: input.id, status: 'draft', ...cursor(input.query) })
  return page(rows.map(versionView), input.query.limit, (r) => ({ id: r.id }))
}
export async function getClauseSheetVersion(
  ctx: ServiceContext,
  input: { id: string; n: number } & ClauseSheetAccess
): Promise<SheetVersion> {
  await resolve(ctx, input, 'project.view')
  const row = await versionByN(ctx.tx, input.id, input.n)
  if (!row) throw notFound()
  return versionView(row)
}
export async function getClauseSheetDraft(
  ctx: ServiceContext,
  input: { id: string; draftId: string } & ClauseSheetAccess
): Promise<SheetVersion> {
  await resolve(ctx, input, 'clause_draft.edit')
  const row = await draftById(ctx.tx, input.id, input.draftId)
  if (!row) throw notFound()
  return versionView(row)
}
export async function createClauseSheetDraft(
  ctx: ServiceContext,
  input: { id: string; content: RawSheet; base_n?: number } & ClauseSheetAccess
): Promise<SheetVersion> {
  const sheet = await resolve(ctx, input, 'clause_draft.edit', true)
  const content = SheetInput.parse(input.content)
  if (content.pack !== sheet.pack) throw notPublishable('The content pack does not match this sheet.')
  const live = await liveSheetVersion(ctx.tx, sheet)
  const baseN = input.base_n ?? live?.n ?? 0
  if (baseN > 0 && !(await versionByN(ctx.tx, sheet.id, baseN)))
    throw notPublishable('The selected base is not a published version of this sheet.')
  let validation: SavedValidation = { check: null, checked: null, registryHash: null }
  try {
    const registry = await loadRegistry(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack })
    validation = (await checkedValidation(content, registry)).validation
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 501)) throw error
  }
  return versionView(
    await insertDraft(ctx.tx, { sheet, content, contentHash: canonicalHash(content), baseN, validation })
  )
}
export async function deleteClauseSheetDraft(
  ctx: ServiceContext,
  input: { id: string; draftId: string } & ClauseSheetAccess
): Promise<{ id: string }> {
  await resolve(ctx, input, 'clause_draft.edit', true)
  const id = await deleteDraft(ctx.tx, input.id, input.draftId)
  if (!id) throw notFound()
  return { id }
}
export async function getClauseSheetDiff(
  ctx: ServiceContext,
  input: { id: string } & DiffInput & ClauseSheetAccess
): Promise<OperationResponse<'getClauseSheetDiff'>> {
  const sheet = await resolve(ctx, input, 'project.view')
  const before =
    input.base === 'live' ? await liveSheetVersion(ctx.tx, sheet) : await versionByN(ctx.tx, sheet.id, input.base)
  const after =
    typeof input.head === 'number'
      ? await versionByN(ctx.tx, sheet.id, input.head)
      : await draftById(ctx.tx, sheet.id, input.head.slice('draft:'.length))
  if (!before || !after) throw notFound()
  return diff(SheetInput.parse(before.content), SheetInput.parse(after.content))
}
export async function evaluateClauseSheet(
  ctx: ServiceContext,
  input: { id: string } & EvaluateInput & ClauseSheetAccess
): Promise<EvaluateView> {
  const sheet = await resolve(ctx, input, 'project.view')
  let content: RawSheet
  if ('content' in input) content = SheetInput.parse(input.content)
  else {
    const row =
      'draft_id' in input
        ? await draftById(ctx.tx, sheet.id, input.draft_id)
        : await versionByN(ctx.tx, sheet.id, input.version_n)
    if (!row) throw notFound()
    content = SheetInput.parse(row.content)
  }
  if (content.pack !== sheet.pack) throw notPublishable('The content pack does not match this sheet.')
  const registry = await loadRegistry(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack })
  const { result } = await checkedValidation(content, registry)
  if (!result.ok || !result.sheet)
    throw notPublishable(result.issues.map((i) => `${i.clauseKey ?? 'sheet'}: ${i.message}`).join('; '))
  const ports = clauseSheetPorts(),
    tEval = input.at ?? instant(input.now)
  let snapshot: IndicatorSnapshot
  let windows: Window[]
  if (input.at) {
    if (!ports.recordedAt) throw unavailable()
    const recorded = await dependency(() =>
      ports.recordedAt!(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack, tEval })
    )
    if (!recorded.history.sources.length || !recorded.history.readings.length)
      throw notPublishable('Recorded history is unavailable at the requested time.')
    const frozen = FrozenWindows.safeParse(recorded.windows)
    if (!frozen.success) throw notPublishable('The recorded frozen windows are incomplete or invalid.')
    windows = frozen.data
    snapshot = await dependency(() => snapshotAt(recorded.history, registry, sheet.projectId, sheet.pack, tEval))
  } else {
    if (!ports.snapshots) throw unavailable()
    windows = await currentSheetWindows(ctx.tx, sheet.projectId)
    snapshot = (
      await dependency(() =>
        ports.snapshots!.take(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack, tEval, windows, persist: false })
      )
    ).snapshot
  }
  const parsed = StoredSnapshot.safeParse(snapshot)
  if (!parsed.success) throw notPublishable('The evaluation snapshot is incomplete.')
  const { hash, ...body } = parsed.data
  if (
    body.projectId !== sheet.projectId ||
    body.pack !== sheet.pack ||
    Date.parse(body.tEval) !== Date.parse(tEval) ||
    body.registryHash !== canonicalHash(registry) ||
    canonicalHash(body) !== hash
  )
    throw notPublishable('The evaluation snapshot does not match its project, time, registry or hash.')
  const verdicts = await dependency(() => evaluate(result.sheet!, parsed.data, windows, tEval))
  return {
    check: checkView(result),
    verdicts: verdictsView(verdicts),
    explanations: explanationsView(explain(verdicts)),
    label: input.at ? 'replay' : 'live'
  }
}
export async function getClauseSheetPublishPreview(
  ctx: ServiceContext,
  input: { id: string } & PreviewInput & ClauseSheetAccess
): Promise<PublishPreviewView> {
  const sheet = await resolve(ctx, input, 'clause_sheet.publish', true)
  human(ctx, input)
  const draft = await draftById(ctx.tx, sheet.id, input.draft_id, true)
  if (!draft) throw notFound()
  const { view, envelope } = await buildPublishPreview(ctx, {
    sheet,
    draft,
    from: instant(new Date(input.now.getTime() - 30 * 86400000)),
    to: instant(input.now)
  })
  await saveSheetPreview(ctx.tx, sheet.id, draft.id, envelope)
  return view
}
export async function publishClauseSheet(
  ctx: ServiceContext,
  input: { id: string } & PublishInput & ClauseSheetAccess
): Promise<PublishedVersionView> {
  const sheet = await resolve(ctx, input, 'clause_sheet.publish', true)
  const principal = human(ctx, input)
  const draft = await draftById(ctx.tx, sheet.id, input.draft_id, true)
  if (!draft) {
    const published = await publishedSheetVersionById(ctx.tx, sheet.id, input.draft_id)
    const prior = PreviewEnvelope.safeParse(published?.publishPreview)
    if (
      published &&
      prior.success &&
      prior.data.draft_id === published.id &&
      prior.data.content_hash === published.contentHash &&
      previewHash(prior.data) === input.preview_hash
    )
      throw stale()
    throw notFound()
  }
  const registry = await loadRegistry(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack })
  const cached = PreviewEnvelope.safeParse(draft.publishPreview)
  if (
    cached.success &&
    (cached.data.draft_id !== draft.id ||
      cached.data.content_hash !== draft.contentHash ||
      cached.data.registry_hashes.current !== canonicalHash(registry))
  )
    throw stale()
  const { result, validation } = await checkedValidation(SheetInput.parse(draft.content), registry)
  requireChecked(result)
  const live = await liveSheetVersion(ctx.tx, sheet)
  if (!live?.n) throw notPublishable('System version 1 has not been initialized.')
  if (
    !cached.success ||
    cached.data.draft_id !== draft.id ||
    cached.data.content_hash !== draft.contentHash ||
    cached.data.live_version_id !== live.id ||
    previewHash(cached.data) !== input.preview_hash
  )
    throw stale()
  let preview
  try {
    preview = await buildPublishPreview(ctx, { sheet, draft, from: cached.data.replay.from, to: cached.data.replay.to })
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) throw stale()
    throw error
  }
  if (preview.view.preview_hash !== input.preview_hash) throw stale()
  const n = live.n + 1
  const published = await promoteDraft(ctx.tx, {
    sheet,
    draft,
    n,
    accountId: principal.accountId,
    publishedAt: input.now,
    validation
  })
  const counts = { clauses_changed: preview.view.diff.length, replay_calls_changed: preview.view.replay.calls_changed }
  await appendLedger(ctx.tx, {
    projectId: sheet.projectId,
    kind: 'clause_version',
    refs: { sheet_id: sheet.id, version_id: published.id },
    body: { pack: sheet.pack, version_n: n, content_hash: published.contentHash, ...counts }
  })
  await recordAudit(ctx.tx, {
    action: 'clause_sheet.published',
    target: { type: 'clause_sheet', id: sheet.id },
    projectId: sheet.projectId,
    before: { live_version_id: live.id },
    after: { version_id: published.id, version_n: n, content_hash: published.contentHash }
  })
  await emitEvent(ctx.tx, {
    projectId: sheet.projectId,
    type: 'clause_sheet.published',
    data: { sheet_id: sheet.id, pack: sheet.pack, version_n: n }
  })
  await track(ctx.tx, 'clause_published', { pack: sheet.pack, ...counts }, { projectId: sheet.projectId })
  const view = versionView(published)
  if (view.status !== 'published') throw new Error('Promotion did not publish the selected version')
  return view
}
