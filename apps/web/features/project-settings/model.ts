import type { Pack, ProjectPack } from '@skyclause/contracts'

export function defaultSlaSeconds(pack: Pack): number {
  return pack === 'sky' ? 10 * 60 : 2 * 60 * 60
}

export function slaUpdateBody(
  pack: Pick<ProjectPack, 'pack' | 'enabled'>,
  slaS: number
): {
  enabled: boolean
  sla_s: number
} {
  return { enabled: pack.enabled, sla_s: slaS }
}
