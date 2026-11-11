import type { IndicatorDefinition } from '@skyclause/clauses'
import { apimsIndicators } from './apims'
export { apimsIndicators } from './apims'

export const jpsRainIndicators: IndicatorDefinition[] = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
] satisfies IndicatorDefinition[]

export const metWarningIndicators: IndicatorDefinition[] = [
  { name: 'site.met_warning_in_force', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_warning' },
  { name: 'w.met_warning_in_force', celType: 'bool', unit: '', scope: 'window', sourceKind: 'met_warning' }
] satisfies IndicatorDefinition[]

export const metForecastIndicators: IndicatorDefinition[] = [
  { name: 'site.met_afternoon_thunderstorm', celType: 'bool', unit: '', scope: 'site', sourceKind: 'met_forecast' }
] satisfies IndicatorDefinition[]

export const indicators: IndicatorDefinition[] = [
  ...jpsRainIndicators,
  ...apimsIndicators,
  ...metWarningIndicators,
  ...metForecastIndicators
]
