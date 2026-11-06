import type { Mode, Pack } from '@skyclause/contracts'

export interface ModeBadgeProps {
  mode: Mode | 'storm_watch' | 'no_call'
  pack?: Pack
}

export function ModeBadge(_props: ModeBadgeProps) {
  return <span data-unbuilt="d-brand-assets" />
}
