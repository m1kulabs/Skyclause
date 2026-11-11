import type { IndicatorDefinition } from '@skyclause/clauses'
import { apimsIndicators } from './apims'
export { apimsIndicators } from './apims'

export const jpsRainIndicators: IndicatorDefinition[] = [
  { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_60m_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', unit: 'mm', scope: 'window', sourceKind: 'jps_rain' }
] satisfies IndicatorDefinition[]

export const indicators: IndicatorDefinition[] = [...jpsRainIndicators, ...apimsIndicators]
