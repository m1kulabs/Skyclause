import { canonicalHash, diff, evaluate, type Instant } from '@skyclause/clauses'
import { REGISTRY, SheetInput } from '@skyclause/contracts'
import {
  InvalidStoredPreviewRun,
  liveSheetVersion,
  storedPreviewRuns,
  type SheetRow,
  type VersionRow
} from '@skyclause/db'
import { z } from 'zod'
import type { ServiceContext } from '../../tenancy'
import { checkedValidation, dependency, loadRegistry, notPublishable } from './ports'
import { versionView, wireVerdict, type PublishPreviewView } from './serialize'

const replaySchema = REGISTRY.find((r) => r.operationId === 'getClauseSheetPublishPreview')!.responses[200].content[
  'application/json'
].schema.shape.replay
export const PreviewEnvelope = z.object({
  version: z.literal(1),
  draft_id: z.string(),
  content_hash: z.string(),
  live_version_id: z.string().nullable(),
  registry_hashes: z.object({ current: z.string(), historical: z.array(z.string()) }),
  replay: replaySchema.extend({
    manifest: z.array(
      z.object({ run_id: z.string(), input_hash: z.string(), call_ids: z.array(z.string()), verdict_hash: z.string() })
    )
  })
})
export type PublishPreviewEnvelope = z.infer<typeof PreviewEnvelope>
export const previewHash = (envelope: PublishPreviewEnvelope) =>
  canonicalHash({
    draft_id: envelope.draft_id,
    content_hash: envelope.content_hash,
    live_version_id: envelope.live_version_id,
    registry_hashes: envelope.registry_hashes,
    replay: envelope.replay
  })

/** Replays only recorded runs over a caller-frozen range; no clock, live snapshot or current windows enter this hash. */
export async function buildPublishPreview(
  ctx: ServiceContext,
  input: { sheet: SheetRow; draft: VersionRow; from: Instant; to: Instant }
): Promise<{ view: PublishPreviewView; envelope: PublishPreviewEnvelope }> {
  const { sheet, draft, from, to } = input
  const raw = SheetInput.parse(draft.content)
  if (raw.pack !== sheet.pack || canonicalHash(raw) !== draft.contentHash)
    throw notPublishable('Draft content does not match its sheet or stored hash.')
  const registry = await loadRegistry(ctx.tx, { projectId: sheet.projectId, pack: sheet.pack })
  const current = await checkedValidation(raw, registry)
  const live = await liveSheetVersion(ctx.tx, sheet)
  const changes = diff(live ? SheetInput.parse(live.content) : { pack: sheet.pack, clauses: [] }, raw)
  const registryHashes = new Set<string>()
  let runs
  try {
    runs = await storedPreviewRuns(ctx.tx, {
      projectId: sheet.projectId,
      pack: sheet.pack,
      from: new Date(from),
      to: new Date(to)
    })
  } catch (error) {
    if (error instanceof InvalidStoredPreviewRun) throw notPublishable(error.message)
    throw error
  }
  const replay: PublishPreviewView['replay'] = {
    label: 'replay',
    from,
    to,
    calls_evaluated: 0,
    calls_changed: 0,
    changes: []
  }
  const manifest: PublishPreviewEnvelope['replay']['manifest'] = []
  for (const run of runs) {
    const fail = (reason: string) => notPublishable(`Run ${run.id}: ${reason}`)
    const { hash: snapshotHash, ...snapshotBody } = run.snapshot
    const { hash: verdictHash, ...verdictBody } = run.verdicts
    if (
      canonicalHash(snapshotBody) !== snapshotHash ||
      canonicalHash(verdictBody) !== verdictHash ||
      run.verdicts.snapshotHash !== snapshotHash ||
      run.verdicts.tEval !== run.snapshot.tEval ||
      run.verdicts.pack !== sheet.pack
    )
      throw fail('invalid recorded snapshot or verdict hash')
    if (
      canonicalHash(run.version.content) !== run.version.contentHash ||
      run.sheet.contentHash !== run.version.contentHash ||
      run.verdicts.contentHash !== run.version.contentHash ||
      canonicalHash({ pack: run.sheet.pack, clauses: run.sheet.clauses }) !== run.version.contentHash ||
      run.sheet.registryHash !== run.snapshot.registryHash
    )
      throw fail('inconsistent recorded content or registry pins')
    const historical = await loadRegistry(ctx.tx, {
      projectId: sheet.projectId,
      pack: sheet.pack,
      registryHash: run.snapshot.registryHash
    })
    registryHashes.add(canonicalHash(historical))
    const original = await checkedValidation(run.version.content, historical)
    if (!original.result.ok || !original.result.sheet)
      throw fail('pinned version cannot be checked with the recorded registry')
    const originalSheet = original.result.sheet
    // Evaluate from the real check result, retaining registryTypes without manufacturing a CheckedSheet.
    const originalReplay = await dependency(() =>
      evaluate(originalSheet, run.snapshot, run.windows, run.snapshot.tEval)
    )
    if (originalReplay.hash !== run.verdicts.hash)
      throw fail('stored engine verdict is inconsistent with frozen inputs')
    const checked = await checkedValidation(raw, historical)
    if (!checked.result.ok || !checked.result.sheet) throw fail('draft cannot be evaluated with the recorded registry')
    const checkedSheet = checked.result.sheet
    const after = await dependency(() => evaluate(checkedSheet, run.snapshot, run.windows, run.snapshot.tEval))
    for (const call of run.calls) {
      const kind = call.windowId ? 'window' : call.nightId ? 'night' : 'site'
      const id = call.windowId ?? call.nightId
      const scoped = [...after.site, ...after.windows, ...after.nights].find(
        (v) => v.scope.kind === kind && v.scope.id === id
      )
      if (!scoped) throw fail(`no replayable scope for call ${call.id}`)
      replay.calls_evaluated++
      if (scoped.mode !== call.shadow.mode)
        replay.changes.push({ call_id: call.id, before: call.shadow, after: wireVerdict(scoped, new Map()) })
    }
    manifest.push({
      run_id: run.id,
      input_hash: canonicalHash(run),
      call_ids: run.calls.map((c) => c.id).sort(),
      verdict_hash: after.hash
    })
  }
  replay.changes.sort((a, b) => a.call_id.localeCompare(b.call_id))
  replay.calls_changed = replay.changes.length
  manifest.sort((a, b) => a.run_id.localeCompare(b.run_id))
  const envelope: PublishPreviewEnvelope = {
    version: 1,
    draft_id: draft.id,
    content_hash: draft.contentHash,
    live_version_id: live?.id ?? null,
    registry_hashes: { current: canonicalHash(registry), historical: [...registryHashes].sort() },
    replay: { ...replay, manifest }
  }
  const draftView = versionView({ ...draft, checkResult: current.validation.check })
  const liveView = live ? versionView(live) : null
  if (draftView.status !== 'draft' || (liveView && liveView.status !== 'published'))
    throw notPublishable('Invalid draft or live version status.')
  return {
    envelope,
    view: {
      draft: draftView,
      live: liveView,
      base_n: draft.baseN ?? 0,
      live_n: liveView?.n ?? null,
      base_drift: (draft.baseN ?? 0) !== (liveView?.n ?? 0),
      preview_hash: previewHash(envelope),
      publishable: current.result.publishable && liveView !== null,
      errors: [
        ...current.result.issues.map((i) => ({ path: i.clauseKey ?? '', message: i.message })),
        ...(liveView ? [] : [{ path: 'live', message: 'System version 1 has not been initialized.' }])
      ],
      diff: changes.map((c) => ({ clause_key: c.key, before: c.before, after: c.after })),
      replay
    }
  }
}
