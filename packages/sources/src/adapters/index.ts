import type { SourceAdapter } from '../contract'
import { jpsRain } from './jps'

// Add one registration line per real adapter as its implementation lands.
export const adapters: readonly SourceAdapter<unknown>[] = [jpsRain]

export function getAdapter(kind: string): SourceAdapter<unknown> {
  const adapter = adapters.find((candidate) => candidate.kind === kind)
  if (!adapter) throw new Error(`unregistered source adapter: ${kind}`)
  return adapter
}
