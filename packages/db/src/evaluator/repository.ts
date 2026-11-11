import {
  canonicalHash,
  SOURCE_KINDS,
  type IndicatorRegistry,
  type IndicatorSnapshot,
  type Window
} from '@skyclause/clauses'
import { NotBuiltError, SheetInput, type Pack, type TxHandle } from '@skyclause/contracts'
import { and, eq, inArray, isNull, isNotNull, gt, or, sql, desc } from 'drizzle-orm'
import type { Tx } from '../client'
import { FrozenWindows, StoredSnapshot } from '../clause-sheets/stored'
import {
  clauseSheet,
  indicatorSnapshot,
  project,
  projectPack,
  sheetVersion,
  window,
  night,
  listing,
  shadowState,
  crossing,
  evaluatorReevaluation
} from '../schema'
import { projectGate } from '../gate'
import { isFlagEnabled } from '../flags'
import { emitEvent } from '../events'
import type { Verdict } from '@skyclause/clauses'
import { z } from 'zod'
import type { EvaluatorQuery } from './types'

const StoredEvaluatorRegistry = z
  .array(
    z
      .object({
        name: z.string().min(1),
        celType: z.enum(['double', 'int', 'bool', 'timestamp', 'duration', 'list']),
        unit: z.string(),
        scope: z.enum(['site', 'window']),
        sourceKind: z.enum(SOURCE_KINDS)
      })
      .strict()
  )
  .min(1)
  .superRefine((definitions, ctx) => {
    const names = new Set<string>()
    for (const definition of definitions) {
      if (names.has(definition.name)) ctx.addIssue({ code: 'custom', message: 'Duplicate registry definition' })
      names.add(definition.name)
    }
  })

function tenant(handle: TxHandle): Tx {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('evaluator repository requires a tenant transaction')
  return tx
}
export interface EvaluatorArchive {
  snapshotId: string
  snapshot: IndicatorSnapshot
  registry: IndicatorRegistry
  windows: Window[]
}
function verifyBody(snapshot: IndicatorSnapshot, registry: IndicatorRegistry, windows: Window[]): void {
  const { hash, ...body } = snapshot
  if (canonicalHash(body) !== hash || canonicalHash(registry) !== snapshot.registryHash)
    throw new Error('Invalid evaluator snapshot or registry hash')
  if (
    !StoredSnapshot.safeParse(snapshot).success ||
    !StoredEvaluatorRegistry.safeParse(registry).success ||
    !FrozenWindows.safeParse(windows).success
  )
    throw new NotBuiltError('b-evaluator:snapshot-body')
}
/** Validate the complete stored JSON; return its original body without a lossy schema projection. */
export function readEvaluatorArchive(row: typeof indicatorSnapshot.$inferSelect): EvaluatorArchive {
  if (!row.snapshotBody || !row.registryDefinitions || !row.frozenWindows || !row.archiveHash)
    throw new NotBuiltError('b-evaluator:snapshot-body')
  const snapshot = row.snapshotBody as IndicatorSnapshot
  const registry = row.registryDefinitions as IndicatorRegistry
  const windows = row.frozenWindows as Window[]
  verifyBody(snapshot, registry, windows)
  if (
    snapshot.projectId !== row.projectId ||
    snapshot.pack !== row.pack ||
    Date.parse(snapshot.tEval) !== row.tEval.getTime() ||
    snapshot.hash !== row.hash ||
    canonicalHash(snapshot.inputs) !== canonicalHash(row.inputs) ||
    canonicalHash(snapshot.site) !== canonicalHash(row.site) ||
    canonicalHash(snapshot.series) !== canonicalHash(row.series) ||
    canonicalHash(snapshot.nights) !== canonicalHash(row.nights) ||
    canonicalHash({ snapshot, registry, windows }) !== row.archiveHash
  )
    throw new Error('Invalid evaluator archive identity or hash')
  return { snapshotId: row.id, snapshot, registry, windows }
}
export async function findEvaluatorSnapshot(handle: TxHandle, q: EvaluatorQuery): Promise<EvaluatorArchive | null> {
  const tx = tenant(handle)
  const [row] = await tx
    .select()
    .from(indicatorSnapshot)
    .where(
      and(
        eq(indicatorSnapshot.projectId, q.projectId),
        eq(indicatorSnapshot.pack, q.pack),
        eq(indicatorSnapshot.tEval, new Date(q.tEval))
      )
    )
  return row ? readEvaluatorArchive(row) : null
}
export async function loadEvaluatorSnapshot(tx: TxHandle, q: EvaluatorQuery): Promise<EvaluatorArchive> {
  const row = await findEvaluatorSnapshot(tx, q)
  if (!row) throw new NotBuiltError('b-evaluator:snapshot-body')
  return row
}
export async function saveEvaluatorSnapshot(
  handle: TxHandle,
  q: { snapshot: IndicatorSnapshot; registry: IndicatorRegistry; windows: Window[] }
): Promise<{ snapshotId: string; snapshot: IndicatorSnapshot }> {
  const tx = tenant(handle)
  const key = { projectId: q.snapshot.projectId, pack: q.snapshot.pack, tEval: q.snapshot.tEval }
  const existing = await findEvaluatorSnapshot(tx, key)
  if (existing) return { snapshotId: existing.snapshotId, snapshot: existing.snapshot }
  verifyBody(q.snapshot, q.registry, q.windows)
  await tx
    .insert(indicatorSnapshot)
    .values({
      orgId: tx.orgId!,
      projectId: key.projectId,
      pack: key.pack,
      tEval: new Date(key.tEval),
      inputs: q.snapshot.inputs,
      site: q.snapshot.site,
      series: q.snapshot.series,
      nights: q.snapshot.nights,
      hash: q.snapshot.hash,
      snapshotBody: q.snapshot,
      registryDefinitions: q.registry,
      frozenWindows: q.windows,
      archiveHash: canonicalHash({ snapshot: q.snapshot, registry: q.registry, windows: q.windows })
    })
    .onConflictDoNothing({ target: [indicatorSnapshot.projectId, indicatorSnapshot.pack, indicatorSnapshot.tEval] })
  // READ COMMITTED sees the winning committed row after a concurrent insert finishes.
  const saved = await loadEvaluatorSnapshot(tx, key)
  return { snapshotId: saved.snapshotId, snapshot: saved.snapshot }
}
export async function evaluatorProjectTimeZone(handle: TxHandle, projectId: string): Promise<string> {
  const tx = tenant(handle)
  const [row] = await tx
    .select({ timeZone: project.timeZone })
    .from(project)
    .where(and(eq(project.id, projectId), isNull(project.archivedAt)))
  if (!row) throw new Error('Evaluator project unavailable')
  return row.timeZone
}
/** Raw publication selection only. The API checks it with authoritative installed/stored definitions. */
export async function loadPublishedEvaluatorVersion(
  handle: TxHandle,
  q: { projectId: string; pack: Pack; versionId?: string }
) {
  const tx = tenant(handle)
  const [row] = await tx
    .select({ version: sheetVersion })
    .from(clauseSheet)
    .innerJoin(project, and(eq(project.id, clauseSheet.projectId), isNull(project.archivedAt)))
    .innerJoin(
      sheetVersion,
      and(
        eq(sheetVersion.sheetId, clauseSheet.id),
        q.versionId === undefined ? eq(sheetVersion.id, clauseSheet.liveVersionId) : eq(sheetVersion.id, q.versionId)
      )
    )
    .where(
      and(eq(clauseSheet.projectId, q.projectId), eq(clauseSheet.pack, q.pack), eq(sheetVersion.status, 'published'))
    )
  if (!row || row.version.n === null || row.version.n <= 0) throw new Error('Evaluator published version unavailable')
  const content = SheetInput.safeParse(row.version.content)
  if (!content.success || content.data.pack !== q.pack) throw new Error('Invalid evaluator published sheet content')
  if (canonicalHash(row.version.content) !== row.version.contentHash)
    throw new Error('Invalid evaluator published content hash')
  return {
    versionId: row.version.id,
    n: row.version.n,
    content: content.data,
    contentHash: row.version.contentHash,
    registryHash: row.version.validationRegistryHash
  }
}

/** Every evaluator tenant write takes project, then pack locks. Source-global locks live in separate transactions. */
export async function lockEvaluatorProject(handle: TxHandle, projectId: string): Promise<void> {
  const tx = tenant(handle)
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${'evaluator:project:' + projectId.toLowerCase()}, 0))`
  )
}
export async function loadEvaluatorScope(handle: TxHandle, q: { projectId: string; tEval: string }) {
  const tx = tenant(handle)
  const [found] = await tx.select({ id: project.id }).from(project).where(eq(project.id, q.projectId))
  if (!found || (await projectGate(tx, q.projectId)) !== 'open') return null
  const packs = (
    await tx
      .select({ pack: projectPack.pack })
      .from(projectPack)
      .where(and(eq(projectPack.projectId, q.projectId), eq(projectPack.enabled, true)))
  )
    .map((row) => row.pack)
    .filter((pack) => pack === 'sky' || pack === 'crowd')
  const enabled: Pack[] = packs.filter((pack) => pack !== 'crowd')
  if (packs.includes('crowd') && (await isFlagEnabled(tx, 'pack_crowd', tx.orgId!))) enabled.push('crowd')
  const windows = await tx
    .select()
    .from(window)
    .where(
      and(
        eq(window.projectId, q.projectId),
        isNull(window.cancelledAt),
        eq(window.moderation, 'visible'),
        or(isNull(window.expiresAt), gt(window.expiresAt, new Date(q.tEval)))
      )
    )
  const nights = await tx
    .select({ id: night.id })
    .from(night)
    .innerJoin(
      listing,
      and(eq(listing.nightId, night.id), eq(listing.projectId, q.projectId), eq(listing.state, 'listed'))
    )
    .where(
      and(
        eq(night.projectId, q.projectId),
        inArray(night.state, ['upcoming', 'in_progress']),
        or(isNull(night.exitEnd), gt(night.exitEnd, new Date(q.tEval)))
      )
    )
  return {
    packs: enabled,
    windows: windows.map((w) => ({
      id: w.id,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      kind: w.kind,
      tz: w.tz
    })),
    nightIds: new Set(nights.map((n) => n.id))
  }
}
export async function beginEvaluatorPack(handle: TxHandle, q: EvaluatorQuery): Promise<boolean> {
  const tx = tenant(handle)
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${'evaluator:pack:' + q.projectId.toLowerCase() + ':' + q.pack},0))`
  )
  const [latest] = await tx
    .select({ at: shadowState.evaluatedAt })
    .from(shadowState)
    .where(
      and(eq(shadowState.projectId, q.projectId), eq(shadowState.pack, q.pack), isNotNull(shadowState.evaluatedAt))
    )
    .orderBy(desc(shadowState.evaluatedAt))
    .limit(1)
  return !latest?.at || latest.at.getTime() <= Date.parse(q.tEval)
}
export async function requestEvaluatorReevaluation(
  handle: TxHandle,
  q: { projectId: string; pack: Pack; tEval: string; reason: string }
): Promise<void> {
  const tx = tenant(handle)
  await tx
    .insert(evaluatorReevaluation)
    .values({
      orgId: tx.orgId!,
      projectId: q.projectId,
      pack: q.pack,
      requestedAt: new Date(q.tEval),
      reason: q.reason
    })
    .onConflictDoUpdate({
      target: [evaluatorReevaluation.projectId, evaluatorReevaluation.pack],
      set: { requestedAt: new Date(q.tEval), reason: q.reason, completedAt: null },
      setWhere: sql`${evaluatorReevaluation.requestedAt} <= ${new Date(q.tEval)}`
    })
}
export async function completeEvaluatorReevaluation(handle: TxHandle, q: EvaluatorQuery): Promise<void> {
  const tx = tenant(handle)
  await tx
    .update(evaluatorReevaluation)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(evaluatorReevaluation.projectId, q.projectId),
        eq(evaluatorReevaluation.pack, q.pack),
        sql`${evaluatorReevaluation.requestedAt} <= ${new Date(q.tEval)}`
      )
    )
}
/** Caller computes the semantic key; SQL and actual typed shared writes stay in this package. */
export async function commitEvaluatorVerdict(
  handle: TxHandle,
  q: EvaluatorQuery & {
    snapshotId: string
    sheetVersionId: string
    verdict: Verdict
    semanticKey: string
    previousKey: (v: Verdict) => string
    verdictHash: string
  }
): Promise<{ crossingId: string | null; applied: boolean }> {
  const tx = tenant(handle),
    v = q.verdict
  const where = and(
    eq(shadowState.projectId, q.projectId),
    eq(shadowState.pack, q.pack),
    eq(shadowState.scopeKind, v.scope.kind),
    v.scope.id === null ? isNull(shadowState.scopeId) : eq(shadowState.scopeId, v.scope.id)
  )
  const [previous] = await tx.select().from(shadowState).where(where)
  if (previous?.evaluatedAt && previous.evaluatedAt.getTime() >= Date.parse(q.tEval))
    return { crossingId: null, applied: false }
  const changed = previous
    ? q.previousKey(previous.verdict as Verdict) !== q.semanticKey
    : v.mode !== 'normal' || v.watch || v.noCall !== null || v.recommendations.length > 0
  const values = {
    verdict: v,
    verdictHash: q.verdictHash,
    sheetVersionId: q.sheetVersionId,
    evaluatedAt: new Date(q.tEval),
    since: changed || !previous ? new Date(q.tEval) : previous.since,
    updatedAt: new Date()
  }
  if (previous) await tx.update(shadowState).set(values).where(eq(shadowState.id, previous.id))
  else
    await tx.insert(shadowState).values({
      ...values,
      orgId: tx.orgId!,
      projectId: q.projectId,
      pack: q.pack,
      scopeKind: v.scope.kind,
      scopeId: v.scope.id
    })
  if (!changed) return { crossingId: null, applied: true }
  const from = previous ? (previous.verdict as Verdict).mode : null
  const [row] = await tx
    .insert(crossing)
    .values({
      orgId: tx.orgId!,
      projectId: q.projectId,
      pack: q.pack,
      scopeKind: v.scope.kind,
      scopeId: v.scope.id,
      from,
      to: v.mode,
      at: new Date(q.tEval),
      snapshotId: q.snapshotId,
      verdictHash: q.verdictHash
    })
    .returning({ id: crossing.id })
  await emitEvent(tx, {
    projectId: q.projectId,
    type: 'crossing.detected',
    data: {
      crossing_id: row!.id,
      pack: q.pack,
      scope: v.scope,
      from,
      to: v.mode,
      at: q.tEval,
      snapshot_id: q.snapshotId,
      verdict_hash: q.verdictHash
    }
  })
  return { crossingId: row!.id, applied: true }
}
