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
  sources: { source_id: Cell; kind?: Cell; freshness: Cell; state: Cell; stale_after_min: Cell }[]
  polls: { source_id: Cell; poll_id?: Cell; source_kind?: Cell; outcome: Cell; received_at: Cell }[]
  readings?: { source_id: Cell; poll_id: Cell }[]
}

// An `observed` source counts only polls that stored a new value, so a frozen gauge still ages; a `polled` source
// (MET warnings) also counts `unchanged`, so a quiet feed isn't reported as silent. #54 ages inputs the same way.
const SUCCESSFUL: Record<string, string[]> = { observed: ['ok'], polled: ['ok', 'unchanged'] }

function time(cell: Cell): number {
  return cell instanceof Date ? cell.getTime() : Date.parse(String(cell))
}

// `doGet?health=1`: the deployed build and, per `sources` row, the newest successful poll's receipt time and age.
export function buildHealth({ stamp, now, sources, polls, readings = [] }: Input): Health {
  const counted = new Map(
    sources.map((source) => [String(source.source_id), SUCCESSFUL[String(source.freshness)] ?? ['ok']])
  )
  const apimsIds = new Set(
    sources.filter((source) => source.kind === 'apims').map((source) => String(source.source_id))
  )
  const stationsByPoll = new Map<string, Set<string>>()
  for (const reading of readings) {
    const id = String(reading.source_id)
    const pollId = String(reading.poll_id)
    if (!apimsIds.has(id) || !pollId) continue
    const stations = stationsByPoll.get(pollId) ?? new Set<string>()
    stations.add(id)
    stationsByPoll.set(pollId, stations)
  }
  const newest = new Map<string, number>()
  for (const poll of polls) {
    const ids = new Set([String(poll.source_id)])
    if ((poll.source_kind === 'apims' || poll.source_kind === 'apims_backfill') && poll.poll_id) {
      for (const id of stationsByPoll.get(String(poll.poll_id)) ?? []) ids.add(id)
    }
    const at = time(poll.received_at)
    if (Number.isNaN(at)) continue
    for (const id of ids) {
      if (counted.get(id)?.includes(String(poll.outcome)) && at > (newest.get(id) ?? -Infinity)) newest.set(id, at)
    }
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
