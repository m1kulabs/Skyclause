import { check, evaluate, explain, type CheckedSheet } from '@skyclause/clauses'
import { NotBuiltError, type Pack, type ShadowEvaluator, type TxHandle } from '@skyclause/contracts'
import { loadPublishedEvaluatorVersion } from '@skyclause/db'
import type { RuntimeIndicatorRegistry } from '../clause-sheets/ports'

export function createShadowEvaluator(registry: RuntimeIndicatorRegistry) {
  async function loadCheckedPublishedVersion(
    tx: TxHandle,
    q: { projectId: string; pack: Pack; versionId?: string; registryHash?: string }
  ): Promise<{ versionId: string; n: number; sheet: CheckedSheet }> {
    const version = await loadPublishedEvaluatorVersion(tx, q)
    const definitions = await registry.load(tx, {
      projectId: q.projectId,
      pack: q.pack,
      ...(q.registryHash === undefined ? {} : { registryHash: q.registryHash })
    })
    const result = check(version.content, definitions)
    if (!result.ok || !result.publishable || !result.sheet) throw new NotBuiltError('b-evaluator:published-sheet-check')
    if (result.sheet.contentHash !== version.contentHash) throw new Error('Evaluator checked content hash mismatch')
    return { versionId: version.versionId, n: version.n, sheet: result.sheet }
  }
  const shadow: ShadowEvaluator = {
    loadPublished: (tx, projectId, pack) => loadCheckedPublishedVersion(tx, { projectId, pack }),
    evaluate(sheet, snapshot, windows, tEval) {
      const verdicts = evaluate(sheet, snapshot, windows, tEval)
      return { verdicts, verdictHash: verdicts.hash, explanations: explain(verdicts) }
    }
  }
  return { shadow, loadCheckedPublishedVersion }
}
