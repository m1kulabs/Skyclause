import {
  canonicalHash,
  SOURCE_KINDS,
  type IndicatorRegistry,
  type IndicatorSnapshot,
  type Window
} from '@skyclause/clauses'
import { NotBuiltError, SheetInput, type Pack, type TxHandle } from '@skyclause/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import type { Tx } from '../client'
import { FrozenWindows, StoredSnapshot } from '../clause-sheets/stored'
import { clauseSheet, indicatorSnapshot, project, sheetVersion } from '../schema'
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
