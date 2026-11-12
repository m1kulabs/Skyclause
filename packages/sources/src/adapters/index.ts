import type { SourceAdapter } from '../contract'
import { jpsRain } from './jps'
import { createApimsAdapter } from './apims'
import { metWarning } from './met-warning'
import { metForecast } from './met-forecast'
export { createMetForecastAdapter } from './met-forecast'

// Add one registration line per real adapter as its implementation lands.
export const adapters: readonly SourceAdapter<unknown>[] = [jpsRain, createApimsAdapter(), metWarning, metForecast]

export function getAdapter(kind: string): SourceAdapter<unknown> {
  const adapter = adapters.find((candidate) => candidate.kind === kind)
  if (!adapter) throw new Error(`unregistered source adapter: ${kind}`)
  return adapter
}
