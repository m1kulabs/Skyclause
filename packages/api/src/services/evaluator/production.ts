import { adapters } from '@skyclause/sources'
import { setRecheckPorts } from '../approvals/recheck'
import { setClauseSheetPorts } from '../clause-sheets/ports'
import { createEvaluatorProviders, type EvaluatorProviders } from './index'

let providers: EvaluatorProviders | undefined
/** Lazy real composition. Missing installed definitions/forecast remain explicit dependencies on use. */
export function productionEvaluatorProviders(): EvaluatorProviders {
  return (providers ??= createEvaluatorProviders({ adapters, forecast: null }))
}
export function configureProductionEvaluator(): void {
  const current = productionEvaluatorProviders()
  setClauseSheetPorts({ registry: current.registry, snapshots: current.snapshots, recordedAt: current.recordedAt })
  setRecheckPorts(current)
}
