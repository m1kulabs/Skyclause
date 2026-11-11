import type { IndicatorDefinition } from './types'

/** Installed camera reducer metadata; device ingestion is a separate provider. */
export const CAMERA_INDICATORS: IndicatorDefinition[] = [
  {
    name: 'site.camera_far_low_frames',
    celType: 'int',
    unit: 'frames',
    scope: 'site',
    sourceKind: 'camera'
  }
]
