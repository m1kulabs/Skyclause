import type { IndicatorRegistry } from '../src/types'

export const TEST_REGISTRY: IndicatorRegistry = [
  {
    name: 'site.rain_60m_mm',
    celType: 'double',
    unit: 'mm',
    scope: 'site',
    sourceKind: 'jps_rain'
  },
  {
    name: 'w.rain_max_60m_mm',
    celType: 'double',
    unit: 'mm',
    scope: 'window',
    sourceKind: 'jps_rain'
  },
  {
    name: 'w.rain_max_4h_mm',
    celType: 'double',
    unit: 'mm',
    scope: 'window',
    sourceKind: 'jps_rain'
  },
  {
    name: 'site.api_max',
    celType: 'int',
    unit: 'API',
    scope: 'site',
    sourceKind: 'apims'
  },
  {
    name: 'site.api_0600_min_last3_max',
    celType: 'int',
    unit: 'API',
    scope: 'site',
    sourceKind: 'apims'
  },
  {
    name: 'site.met_warning_in_force',
    celType: 'bool',
    unit: '',
    scope: 'site',
    sourceKind: 'met_warning'
  },
  {
    name: 'w.met_warning_in_force',
    celType: 'bool',
    unit: '',
    scope: 'window',
    sourceKind: 'met_warning'
  },
  {
    name: 'site.met_afternoon_thunderstorm',
    celType: 'bool',
    unit: '',
    scope: 'site',
    sourceKind: 'met_forecast'
  },
  {
    name: 'site.camera_far_low_frames',
    celType: 'int',
    unit: 'frames',
    scope: 'site',
    sourceKind: 'camera'
  },
  {
    name: 'site.night.baseline',
    celType: 'int',
    unit: 'exits',
    scope: 'site',
    sourceKind: 'rapidrail_od'
  },
  {
    name: 'site.night.uplift',
    celType: 'int',
    unit: 'exits',
    scope: 'site',
    sourceKind: 'rapidrail_od'
  },
  {
    name: 'site.night.forecast',
    celType: 'int',
    unit: 'exits',
    scope: 'site',
    sourceKind: 'rapidrail_od'
  },
  {
    name: 'site.night.band_low',
    celType: 'int',
    unit: 'exits',
    scope: 'site',
    sourceKind: 'rapidrail_od'
  },
  {
    name: 'site.night.band_high',
    celType: 'int',
    unit: 'exits',
    scope: 'site',
    sourceKind: 'rapidrail_od'
  },
  {
    name: 'site.night.doors',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.show',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.arrival_start',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.arrival_end',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.exit_start',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.exit_end',
    celType: 'timestamp',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  },
  {
    name: 'site.night.single_source',
    celType: 'bool',
    unit: '',
    scope: 'site',
    sourceKind: 'golive'
  }
]

// Complete simulated measurement grid: a dry period followed by one measured burst.
// This declares test history; it never fills gaps in source/runtime data.
export function completeRainSeries(end: string, total: number, minutes: number): Array<[string, number, string]> {
  const endMs = Date.parse(end)
  return Array.from({ length: minutes / 5 }, (_, index) => {
    const ms = endMs - (minutes - 5 - index * 5) * 60_000
    return [new Date(ms).toISOString().replace('.000Z', 'Z'), ms === endMs ? total : 0, `rain-${ms}`]
  })
}
