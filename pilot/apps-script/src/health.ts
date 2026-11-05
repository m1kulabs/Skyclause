import { toMytIso } from '../../shared/time.ts'
import type { Cell } from './schema.ts'

export interface Stamp {
  sha: string
  builtAt: string
}

export interface SourceHealth {
  source_id: string
  state: string
  received_at: string | null
  age_min: number | null
  stale_after_min: number | null
}

export interface Health {
  ok: true
  sha: string
  built_at: string
  sources: SourceHealth[]
}

interface Input {
  stamp: Stamp
  now: Date
  sources: { source_id: Cell; state: Cell; stale_after_min: Cell }[]
  polls: { source_id: Cell; outcome: Cell; received_at: Cell }[]
}

// A poll that reached the source and parsed: `unchanged` counts, so a quiet MET feed isn't reported as silent.
const SUCCESSFUL = ['ok', 'unchanged']

function time(cell: Cell): number {
  return cell instanceof Date ? cell.getTime() : Date.parse(String(cell))
}

// `doGet?health=1`: the deployed build and, per `sources` row, the newest successful poll's receipt time and age.
export function buildHealth({ stamp, now, sources, polls }: Input): Health {
  const newest = new Map<string, number>()
  for (const poll of polls) {
    if (!SUCCESSFUL.includes(String(poll.outcome))) continue
    const id = String(poll.source_id)
    const at = time(poll.received_at)
    if (!Number.isNaN(at) && at > (newest.get(id) ?? -Infinity)) newest.set(id, at)
  }
  return {
    ok: true,
    sha: stamp.sha,
    built_at: stamp.builtAt,
    sources: sources.map((source) => {
      const at = newest.get(String(source.source_id))
      return {
        source_id: String(source.source_id),
        state: String(source.state),
        received_at: at === undefined ? null : toMytIso(new Date(at)),
        age_min: at === undefined ? null : Math.floor((now.getTime() - at) / 60_000),
        stale_after_min: source.stale_after_min === '' ? null : Number(source.stale_after_min)
      }
    })
  }
}
