import type { ReadingHistory } from '@skyclause/clauses'
import type { ForecastSource, SnapshotSource, ShadowEvaluator, TxHandle } from '@skyclause/contracts'
import type { SourceAdapter } from '@skyclause/sources'
import type { RuntimeIndicatorRegistry } from '../clause-sheets/ports'
import { loadEvaluatorRangeHistory } from './history'
import { createRuntimeRegistry } from './registry'
import { createShadowEvaluator } from './shadow'
import { createSnapshotSource } from './snapshot'

export interface EvaluatorProviders {
  registry: RuntimeIndicatorRegistry
  snapshots: SnapshotSource
  shadow: ShadowEvaluator
  loadCheckedPublishedVersion: ReturnType<typeof createShadowEvaluator>['loadCheckedPublishedVersion']
  history(tx: TxHandle, q: { projectId: string; from: string; to: string }): Promise<ReadingHistory>
  // No authoritative recorded-at-time bindings/settings/windows exist yet.
  recordedAt: null
}
export function createEvaluatorProviders(q: {
  adapters: readonly SourceAdapter<unknown>[]
  forecast: ForecastSource | null
}): EvaluatorProviders {
  const registry = createRuntimeRegistry(q.adapters)
  return {
    registry,
    snapshots: createSnapshotSource(registry, q.forecast),
    ...createShadowEvaluator(registry),
    history: loadEvaluatorRangeHistory,
    recordedAt: null
  }
}

export { semanticVerdictKey } from './scope'

export { createRuntimeRegistry, installedIndicatorDefinitions } from './registry'
export { loadEvaluatorHistory } from './history'
export { nextEvaluationAt, evaluatorWindows } from './deadline'
export { productionEvaluatorProviders, configureProductionEvaluator } from './production'
