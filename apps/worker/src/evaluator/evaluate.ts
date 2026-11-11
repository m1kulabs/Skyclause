import {
  evaluatorWindows,
  loadEvaluatorHistory,
  nextEvaluationAt,
  semanticVerdictKey,
  type EvaluatorProviders
} from '@skyclause/api'
import { recordUsedReadingLatency } from './measurement'
import type { ReadingHistory } from '@skyclause/clauses'
import type { Instant, Pack, TxHandle } from '@skyclause/contracts'
import {
  findEvaluatorSnapshot,
  beginEvaluatorPack,
  commitEvaluatorVerdict,
  completeEvaluatorReevaluation,
  loadEvaluatorScope,
  loadEvaluatorSnapshot,
  lockEvaluatorProject,
  requestEvaluatorReevaluation,
  withSavepoint
} from '@skyclause/db'

export interface EvaluationCommit {
  projectId: string
  tEval: Instant
  crossingIds: string[]
  usedReadingIds: string[]
  deferredPacks: Pack[]
  histories: ReadingHistory[]
  deadline: Instant | null
}
/** No nested tenant transactions. Each pack atomically commits its original archive, verdicts and outbox events. */
export async function evaluateProject(
  tx: TxHandle,
  q: { projectId: string; tEval: Instant; measurementPollId?: string },
  providers: EvaluatorProviders
): Promise<EvaluationCommit> {
  const result: EvaluationCommit = {
    ...q,
    crossingIds: [],
    usedReadingIds: [],
    deferredPacks: [],
    histories: [],
    deadline: null
  }
  await lockEvaluatorProject(tx, q.projectId)
  const scope = await loadEvaluatorScope(tx, q)
  if (!scope) return result
  for (const pack of scope.packs) {
    const query = { ...q, pack }
    let history: ReadingHistory | null = null
    try {
      const committed = await withSavepoint(tx, async (child) => {
        if (!(await beginEvaluatorPack(child, query)))
          return { crossingIds: [], readingIds: [], history: null, deadline: null }
        history = await loadEvaluatorHistory(child, query)
        const existing = await findEvaluatorSnapshot(child, query)
        if (!existing) {
          const current = await providers.loadCheckedPublishedVersion(child, { projectId: q.projectId, pack })
          await providers.snapshots.take(child, {
            ...query,
            windows: evaluatorWindows(current.sheet, scope.windows, q.tEval),
            persist: true
          })
        }
        const archive = await loadEvaluatorSnapshot(child, query)
        const published = await providers.loadCheckedPublishedVersion(child, {
          projectId: q.projectId,
          pack,
          registryHash: archive.snapshot.registryHash
        })
        const evaluated = providers.shadow.evaluate(
          published.sheet,
          archive.snapshot,
          archive.windows,
          archive.snapshot.tEval
        )
        const currentWindows = new Set(evaluatorWindows(published.sheet, scope.windows, q.tEval).map((w) => w.id))
        const verdicts = [
          ...evaluated.verdicts.site,
          ...evaluated.verdicts.windows.filter((v) => v.scope.id !== null && currentWindows.has(v.scope.id)),
          ...evaluated.verdicts.nights.filter((v) => v.scope.id !== null && scope.nightIds.has(v.scope.id))
        ]
        const crossingIds: string[] = [],
          readingIds = new Set<string>()
        for (const verdict of verdicts) {
          const commit = await commitEvaluatorVerdict(child, {
            ...query,
            snapshotId: archive.snapshotId,
            sheetVersionId: published.versionId,
            verdict,
            semanticKey: semanticVerdictKey(verdict),
            previousKey: semanticVerdictKey,
            verdictHash: evaluated.verdictHash
          })
          if (commit.crossingId) crossingIds.push(commit.crossingId)
          if (!commit.applied) continue
          for (const clause of verdict.clauses)
            for (const input of clause.inputs) for (const readingId of input.readingIds) readingIds.add(readingId)
        }
        if (q.measurementPollId)
          await recordUsedReadingLatency(child, { ...query, pollId: q.measurementPollId, readingIds: [...readingIds] })
        await completeEvaluatorReevaluation(child, query)
        const deadline = nextEvaluationAt({
          history,
          sheet: published.sheet,
          windows: archive.windows.filter((w) => currentWindows.has(w.id)),
          snapshot: archive.snapshot,
          tEval: q.tEval
        })
        return { crossingIds, readingIds: [...readingIds], history, deadline }
      })
      if (committed.deadline && (!result.deadline || Date.parse(committed.deadline) < Date.parse(result.deadline)))
        result.deadline = committed.deadline
      result.crossingIds.push(...committed.crossingIds)
      result.usedReadingIds.push(...committed.readingIds)
    } catch (error) {
      await requestEvaluatorReevaluation(tx, {
        ...query,
        reason: error instanceof Error ? error.message : String(error)
      })
      result.deferredPacks.push(pack)
    }
    if (history) result.histories.push(history)
  }
  result.usedReadingIds = [...new Set(result.usedReadingIds)].sort()
  return result
}
