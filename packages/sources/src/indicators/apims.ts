import type { IndicatorDefinition } from '@skyclause/clauses'

export const apimsIndicators: IndicatorDefinition[] = [
  { name: 'site.api_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' },
  { name: 'site.api_0600_min_last3_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' }
] satisfies IndicatorDefinition[]
