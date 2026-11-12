export * from './types'
export { CAMERA_INDICATORS } from './indicators'
export * from './placeholders/b-clauses'
export * from './placeholders/b-replay'
export { resolveSourceAt } from './snapshot'
export type { SourceResolution } from './snapshot'
export { effectiveWindowSpan } from './span'

export {
  metForecastDateBoundaries,
  nextSourceChangeAt,
  dedupeReadingsAt,
  metWarningValidity,
  latestMytMorning,
  toMytDateString
} from './snapshot'
export { RAIN_STEP_MS, rainPeriod } from './rain'
