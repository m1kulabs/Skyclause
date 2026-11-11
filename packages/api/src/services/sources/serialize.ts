import { Poll, Reading, Source, SourceState, type Operations } from '@skyclause/contracts'
import type { SourceProjection } from '@skyclause/db'
import type { z } from 'zod'
import { toWire } from '../../serialize'

export type CatalogueSourceView = z.infer<
  Operations['listCatalogueSources']['responses'][200]['content']['application/json']['schema']
>['data'][number]
export type BoundSourceView = z.infer<
  Operations['bindSource']['responses'][201]['content']['application/json']['schema']
>

function serializeProjection(row: SourceProjection, now: Date) {
  const latest = row.latestReading
  return {
    source: Source.parse({
      ...(toWire(row.source) as object),
      licence_label: row.source.licenceId === null ? 'no published terms' : row.source.licenceLabel
    }),
    state: row.state ? SourceState.parse(toWire(row.state)) : null,
    latest_reading: latest ? Reading.parse({ ...(toWire(latest) as object), revision: String(latest.revision) }) : null,
    age_s: latest ? Math.max(0, Math.floor((now.getTime() - latest.observedAt.getTime()) / 1000)) : null
  }
}

export function serializeCatalogueSource(
  row: SourceProjection & { distanceKm: number | null },
  now: Date
): CatalogueSourceView {
  const view = serializeProjection(row, now)
  return {
    ...view.source,
    distance_km: row.distanceKm,
    latest_reading: view.latest_reading,
    age_s: view.age_s,
    source_state: view.state
  }
}

export function serializeBoundSource(
  row: SourceProjection,
  binding: Pick<BoundSourceView, 'project_id' | 'role'>,
  now: Date
): BoundSourceView {
  const view = serializeProjection(row, now)
  return {
    ...view.source,
    ...binding,
    state: view.state,
    latest_reading: view.latest_reading,
    age_s: view.age_s,
    recent_errors: row.recentErrors.map((poll) => Poll.parse(toWire(poll)))
  }
}
