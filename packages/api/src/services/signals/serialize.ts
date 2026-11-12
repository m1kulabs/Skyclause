import { Poll, type Operations } from '@skyclause/contracts'
import type { ProjectSourceHealthRecord } from '@skyclause/db'
import type { z } from 'zod'
import { instant, toWire } from '../../serialize'
import { serializeBoundSource } from '../sources/serialize'

export type ProjectSourceHealthView = z.infer<
  Operations['listProjectSources']['responses'][200]['content']['application/json']['schema']
>['data'][number]

/** List-only health projection; evaluator state and bind/catalogue semantics stay owned by their existing paths. */
export function serializeProjectSourceHealth(row: ProjectSourceHealthRecord, now: Date): ProjectSourceHealthView {
  const view = serializeBoundSource(row, { project_id: row.projectId, role: row.role }, now)
  const blocked = row.state?.state === 'error' || row.latestNormalPoll?.outcome === 'error'
  const since = row.source.freshness === 'polled' ? row.latestGoodNormalPoll?.startedAt : row.latestReading?.observedAt
  const elapsed = since ? now.getTime() - since.getTime() : null
  const width = row.source.cadenceS * 1000
  const start = now.getTime() - 48 * width
  const history: NonNullable<ProjectSourceHealthView['history']> = Array.from({ length: 48 }, (_, i) => ({
    start_at: instant(new Date(start + i * width)),
    end_at: instant(new Date(start + (i + 1) * width)),
    status: 'missed'
  }))
  for (const poll of row.normalPolls) {
    const index = Math.floor((poll.startedAt.getTime() - start) / width)
    const slot = history[index]
    if (!slot) continue
    if (poll.outcome === 'error') slot.status = 'error'
    else if (slot.status !== 'error' && (poll.outcome === 'ok' || poll.outcome === 'unchanged'))
      slot.status = 'received'
  }
  const error = row.recentErrors[0]
  return {
    ...view,
    state: row.state?.state !== 'error' && row.latestNormalPoll?.outcome === 'error' ? null : view.state,
    latest_reading: blocked ? null : view.latest_reading,
    age_s: blocked || elapsed === null || elapsed < 0 ? null : Math.floor(elapsed / 1000),
    history,
    last_error: error ? { ...Poll.parse(toWire(error)), message: error.message, purpose: error.purpose } : null
  }
}
