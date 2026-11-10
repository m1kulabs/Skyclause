import type { CheckResult, ClauseResult, ClauseExplanation, Verdicts } from '@skyclause/clauses'
import { SheetInput, SheetVersion, type Operations, type ClauseSheet } from '@skyclause/contracts'
import type { SheetRow, VersionRow } from '@skyclause/db'
import { z } from 'zod'
import { instant } from '../../serialize'
import { wireInput, wireVerdict } from '../approvals/recheck'

export type OperationResponse<Id extends keyof Operations, Status extends number = 200> = Operations[Id] extends {
  responses: { [K in Status]: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never
export type EvaluateView = OperationResponse<'evaluateClauseSheet'>
export type PublishPreviewView = OperationResponse<'getClauseSheetPublishPreview'>
export type PublishedVersionView = OperationResponse<'publishClauseSheet', 201>
export type EvaluateInput = z.infer<
  Operations['evaluateClauseSheet']['request']['body']['content']['application/json']['schema']
>
export type DiffInput = z.infer<Operations['getClauseSheetDiff']['request']['query']>
export type PreviewInput = z.infer<Operations['getClauseSheetPublishPreview']['request']['query']>
export type PublishInput = z.infer<
  Operations['publishClauseSheet']['request']['body']['content']['application/json']['schema']
>
export const checkView = (result: Pick<CheckResult, 'ok' | 'publishable' | 'issues'>) => ({
  ok: result.ok,
  publishable: result.publishable,
  issues: result.issues.map((i) => ({
    clause_key: i.clauseKey,
    message: i.message,
    offset: i.offset,
    length: i.length
  }))
})
const storedCheck = z.object({
  ok: z.boolean(),
  publishable: z.boolean(),
  issues: z.array(
    z.object({
      clauseKey: z.string().nullable(),
      message: z.string(),
      offset: z.number().int().nonnegative(),
      length: z.number().int().nonnegative()
    })
  )
})
export function versionView(row: VersionRow): SheetVersion {
  const check = row.checkResult === null ? null : checkView(storedCheck.parse(row.checkResult))
  return SheetVersion.parse({
    id: row.id,
    n: row.n,
    status: row.status,
    content: SheetInput.parse(row.content),
    content_hash: row.contentHash,
    base_n: row.baseN,
    published_by: row.publishedBy,
    published_at: row.publishedAt ? instant(row.publishedAt) : null,
    check,
    publishable: check?.publishable ?? false,
    validation_status: check ? 'checked' : 'unavailable'
  })
}
export const sheetView = (row: SheetRow): ClauseSheet => ({
  id: row.id,
  project_id: row.projectId,
  pack: row.pack,
  live_version_id: row.liveVersionId
})
const urls = new Map<string, string>()
export { wireVerdict }
export function verdictsView(v: Verdicts): EvaluateView['verdicts'] {
  return {
    t_eval: v.tEval,
    pack: v.pack,
    content_hash: v.contentHash,
    snapshot_hash: v.snapshotHash,
    site: v.site.map((v) => wireVerdict(v, urls)),
    windows: v.windows.map((v) => wireVerdict(v, urls)),
    nights: v.nights.map((v) => wireVerdict(v, urls)),
    hash: v.hash
  }
}
function clauseView(c: ClauseResult) {
  return {
    key: c.key,
    result: c.result,
    blocked_by: c.blockedBy.map((b) => ({ name: b.name, source_id: b.sourceId, state: b.state, since: b.since })),
    ...(c.span ? { span: c.span } : {}),
    inputs: c.inputs.map((i) => wireInput(i, urls))
  }
}
export const explanationsView = (explanations: ClauseExplanation[]): EvaluateView['explanations'] =>
  explanations.map((c) => ({ ...clauseView(c), cel: c.cel, wording: c.wording }))
