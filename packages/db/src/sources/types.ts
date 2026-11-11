import type { SourceKind } from '@skyclause/contracts'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface CatalogueMetadata {
  kind: SourceKind
  cadence: number
  freshness: 'observed' | 'polled'
  licence: { id: string | null; label: string }
}

export interface DiscoveredSourceDto {
  externalId: string
  name: string
  lat: number | null
  lon: number | null
  url: string
  meta: Record<string, JsonValue>
  staleAfterS?: number
}

export interface BoundSource extends DiscoveredSourceDto {
  id: string
  kind: SourceKind
  ownerOrgId: string | null
  cadenceS: number
  freshness: 'observed' | 'polled'
  staleAfterS: number
  licenceId: string | null
  licenceLabel: string
  probation: boolean
  bindings: Array<{ orgId: string; projectId: string }>
  /** Latest successful normal poll digest; backfill captures never replace this baseline. */
  previousBodySha256: string | null
}

export interface CrowdPeriodDto {
  id: string
  projectId: string
  state: 'upcoming' | 'in_progress'
  arrivalStart: string
  arrivalEnd: string | null
  exitStart: string | null
  exitEnd: string | null
}

/** Metric payloads have passed adapter validation; ingestion assigns receivedAt from its actual write clock. */
export interface SourceReadingWrite {
  metric: string
  observedAt: Date
  receivedAt: Date
  unit: string | null
  value: number | null
  valueText?: string | null
  valueJson?: JsonValue
  itemKey?: string
  deviceTime?: Date | null
}

export interface SourceRequestWrite {
  requestId: string
  startedAt: Date
  purpose: 'poll' | 'backfill'
  family: string | null
  httpStatus: number | null
  latencyMs: number
  sources: Array<{
    sourceId: string
    outcome: 'ok' | 'error'
    bodySha256: string | null
    errorCode?: string | null
    message?: string | null
    readings: SourceReadingWrite[]
  }>
}

export interface StoredSourcePoll {
  id: string
  sourceId: string
  kind: SourceKind
  outcome: 'ok' | 'unchanged' | 'error'
  httpStatus: number | null
  newRows: number
  purpose: 'poll' | 'backfill'
  startedAt: Date
  receivedAt: Date | null
}
