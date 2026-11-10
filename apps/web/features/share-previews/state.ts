import { brandStates, type BrandState, type ColourLevel } from '@skyclause/elements'
import type { PublicStatus } from './reads'

type PackState = PublicStatus['packs'][number]

const SEVERITY: Record<ColourLevel, number> = { 'no-call': 0, neutral: 1, warning: 2, critical: 3 }
const PACK_ORDER = { sky: 0, crowd: 1 } as const

/** A call's brand state: its mode, else Storm watch for a watch, else No call. */
export function callState(o: { mode: PackState['mode']; watch: boolean }): BrandState {
  return o.mode ?? (o.watch ? 'storm_watch' : 'no_call')
}

/**
 * D3: the pack whose approved call in force is most severe (critical, warning, neutral), Sky first on a tie (ticket
 * decision). An engine verdict never counts; null means "No approved call yet".
 */
export function headline(packs: readonly PackState[]): PackState | null {
  const level = (pack: PackState) => SEVERITY[brandStates[callState(pack)].level]
  const calls = packs
    .filter((pack) => pack.basis === 'approved_call')
    .sort((a, b) => level(b) - level(a) || PACK_ORDER[a.pack] - PACK_ORDER[b.pack])
  return calls[0] ?? null
}

/** D3: a failing required input in any pack adds No call. */
export function failingInputs(packs: readonly PackState[]) {
  return packs.flatMap((pack) => pack.no_call?.inputs ?? [])
}
