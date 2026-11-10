import type { ReadingHistory } from '@skyclause/clauses'
import type { TxHandle } from '@skyclause/contracts'
import { loadEvaluatorHistory as loadHistory, type EvaluatorQuery } from '@skyclause/db'
import { mapSourceMetadata } from './registry'

/** SQL stays in DB; adapter payload contracts stay at the provider boundary. */
export async function loadEvaluatorHistory(tx: TxHandle, q: EvaluatorQuery): Promise<ReadingHistory> {
  const history = await loadHistory(tx, q)
  const newest = [...history.readings].sort(
    (a, b) =>
      Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
      Date.parse(b.receivedAt) - Date.parse(a.receivedAt) ||
      b.revision - a.revision ||
      b.id.localeCompare(a.id)
  )
  for (const source of history.sources)
    source.meta = mapSourceMetadata(
      source.kind,
      source.meta,
      newest.filter((row) => row.sourceId === source.id)
    )
  return history
}
