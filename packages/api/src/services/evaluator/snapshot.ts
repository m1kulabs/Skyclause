import { canonicalHash, snapshotAt } from '@skyclause/clauses'
import { NotBuiltError, type ForecastSource, type SnapshotSource } from '@skyclause/contracts'
import { evaluatorProjectTimeZone, findEvaluatorSnapshot, saveEvaluatorSnapshot } from '@skyclause/db'
import { formatDateKeyAt } from '@skyclause/i18n/format'
import type { RuntimeIndicatorRegistry } from '../clause-sheets/ports'
import { loadEvaluatorHistory } from './history'

export function createSnapshotSource(
  registry: RuntimeIndicatorRegistry,
  forecast: ForecastSource | null
): SnapshotSource {
  return {
    async take(tx, q) {
      if (q.persist) {
        const existing = await findEvaluatorSnapshot(tx, q)
        if (existing) return { snapshotId: existing.snapshotId, snapshot: existing.snapshot }
      }
      const timeZone = await evaluatorProjectTimeZone(tx, q.projectId)
      if (q.pack === 'crowd' && !forecast) throw new NotBuiltError('b-forecast')
      const definitions = await registry.load(tx, { projectId: q.projectId, pack: q.pack })
      const history = await loadEvaluatorHistory(tx, q)
      let snapshot = snapshotAt(history, definitions, q.projectId, q.pack, q.tEval)
      if (q.pack === 'crowd') {
        // Include every supplied window's local date; callers own their evaluation horizon.
        const dates = [q.tEval, ...q.windows.flatMap((window) => [window.startsAt, window.endsAt])]
          .map((instant) => formatDateKeyAt(instant, timeZone))
          .sort()
        const nights = await forecast!.nights(tx, {
          projectId: q.projectId,
          from: dates[0]!,
          to: dates[dates.length - 1]!
        })
        const { hash: _hash, ...body } = snapshot
        const withNights = { ...body, nights }
        snapshot = { ...withNights, hash: canonicalHash(withNights) }
      }
      return q.persist
        ? saveEvaluatorSnapshot(tx, { snapshot, registry: definitions, windows: q.windows })
        : { snapshotId: null, snapshot }
    }
  }
}
