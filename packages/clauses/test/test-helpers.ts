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
