import { CAMERA_INDICATORS } from '@skyclause/clauses'
import { adapters } from '@skyclause/sources'
import { setRecheckPorts } from '../approvals/recheck'
import { setWhatIfEngine } from '../analysis'
import { setClauseSheetPorts } from '../clause-sheets/ports'
import { createEvaluatorProviders, type EvaluatorProviders } from './index'
import { installedIndicatorDefinitions, type IndicatorProvider } from './registry'

/** Shared installed declarations for API, live evaluation and grading; no provider I/O. */
export function productionIndicatorProviders(): readonly IndicatorProvider[] {
  return [...adapters, { indicators: CAMERA_INDICATORS }]
}
let providers: EvaluatorProviders | undefined
/** Lazy real composition. Missing installed definitions/forecast remain explicit dependencies on use. */
export function productionEvaluatorProviders(): EvaluatorProviders {
  return (providers ??= createEvaluatorProviders({
    adapters: productionIndicatorProviders(),
    forecast: null
  }))
}
export function configureProductionEvaluator(): void {
  const current = productionEvaluatorProviders()
  setClauseSheetPorts({ registry: current.registry, snapshots: current.snapshots, recordedAt: current.recordedAt })
  setRecheckPorts(current)
  // `check` and `replay` stay on the engine's own defaults, the `@skyclause/clauses` exports, so #136 needs no change here.
  const definitions = installedIndicatorDefinitions(productionIndicatorProviders())
  setWhatIfEngine({ registry: definitions.length ? definitions : null, history: current.history })
}
