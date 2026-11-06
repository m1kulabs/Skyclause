import type { SourceKind } from '@skyclause/contracts'
import { attribution as catalogueAttribution } from '@skyclause/i18n/brand'

export const attribution = catalogueAttribution satisfies Record<
  SourceKind,
  {
    licence_name: string | null
    licence_url: string | null
    derived_only: boolean
  }
>
