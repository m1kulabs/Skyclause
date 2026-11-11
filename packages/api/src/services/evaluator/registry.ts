import {
  PACK_SOURCE_KINDS,
  canonicalHash,
  type IndicatorDefinition,
  type ReadingHistory,
  type SourceKind
} from '@skyclause/clauses'
import { NotBuiltError } from '@skyclause/contracts'
import { SOURCE_METRICS, type SourceAdapter } from '@skyclause/sources'
import { loadEvaluatorRegistry } from '@skyclause/db'
import type { RuntimeIndicatorRegistry } from '../clause-sheets/ports'

export type IndicatorProvider = Pick<SourceAdapter<unknown>, 'indicators'>

/** Pure declarations from installed providers; no network or database at startup. */
export function installedIndicatorDefinitions(adapters: readonly IndicatorProvider[]) {
  const byName = new Map<string, IndicatorDefinition>()
  for (const adapter of adapters)
    for (const definition of adapter.indicators) {
      const prior = byName.get(definition.name)
      if (prior && canonicalHash(prior) !== canonicalHash(definition))
        throw new Error(`Conflicting registered indicator definition: ${definition.name}`)
      byName.set(definition.name, { ...definition })
    }
  const definitions = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return definitions
}
/** Real installed adapter and engine declarations are the current registry authority. */
export function createRuntimeRegistry(adapters: readonly IndicatorProvider[]): RuntimeIndicatorRegistry {
  return {
    async load(_tx, q) {
      const definitions = installedIndicatorDefinitions(adapters).filter((d) =>
        PACK_SOURCE_KINDS[q.pack].includes(d.sourceKind)
      )
      if (q.registryHash !== undefined && q.registryHash !== canonicalHash(definitions))
        return loadEvaluatorRegistry(_tx, { projectId: q.projectId, pack: q.pack, registryHash: q.registryHash })
      if (!definitions.length) throw new NotBuiltError('b-evaluator:indicator-registry')
      return definitions
    }
  }
}
/** Payload-derived temporal metadata must come from schema-validated eligible readings. */
export function mapSourceMetadata(
  kind: SourceKind,
  meta: Record<string, unknown>,
  readings: Array<Pick<ReadingHistory['readings'][number], 'metric' | 'valueJson'>>
): Record<string, unknown> {
  const result = { ...meta }
  if (kind === 'rapidrail_od') {
    for (const key of ['next_update', 'nextUpdate', 'pending_until', 'pendingUntil']) delete result[key]
    const row = readings.find((row) => row.metric === 'metadata')
    const parsed = SOURCE_METRICS.rapidrail_od.metadata.value_json.safeParse(row?.valueJson)
    if (!parsed.success) throw new NotBuiltError('b-evaluator:rapidrail-metadata-history')
    result.next_update = parsed.data.next_update_utc
  }
  if (kind === 'gtfs_static') {
    delete result.calendar_end
    const row = readings.find((row) => row.metric === 'feed')
    const parsed = SOURCE_METRICS.gtfs_static.feed.value_json.safeParse(row?.valueJson)
    if (!parsed.success) throw new NotBuiltError('b-evaluator:gtfs-feed-history')
    result.calendar_end = parsed.data.calendar_end
  }
  return result
}
