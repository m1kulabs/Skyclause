import type {
  CheckedSheet,
  ClauseExplanation,
  IndicatorSnapshot,
  NightInput,
  Verdicts,
  Window
} from '@skyclause/clauses'
import type { AnalyticsEvent, AnalyticsEventType } from './analytics'
import type { Instant, LedgerEntry, LedgerKind, LocalDate, NotificationKind, Pack, Plan } from './api/shared'
import type { AuditAction } from './audit'
import type { Principal } from './auth'
import type { DomainEvent, DomainEventType, EventEnvelope } from './events'

// Spec §1: db's Tx implements this brand. Contracts never import the database package.
declare const txHandle: unique symbol
export interface TxHandle {
  readonly [txHandle]: true
}

export interface SnapshotSource {
  // b-evaluator; persist=false for previews and the Commons.
  take(
    tx: TxHandle,
    q: { projectId: string; pack: Pack; tEval: Instant; windows: Window[]; persist: boolean }
  ): Promise<{ snapshotId: string | null; snapshot: IndicatorSnapshot }>
}

export interface ShadowEvaluator {
  // b-evaluator
  loadPublished(
    tx: TxHandle,
    projectId: string,
    pack: Pack
  ): Promise<{ versionId: string; n: number; sheet: CheckedSheet }>
  evaluate(
    sheet: CheckedSheet,
    s: IndicatorSnapshot,
    w: Window[],
    tEval: Instant
  ): { verdicts: Verdicts; verdictHash: string; explanations: ClauseExplanation[] }
}

export interface ForecastSource {
  // b-forecast; listed listings only.
  nights(tx: TxHandle, q: { projectId: string; from: LocalDate; to: LocalDate }): Promise<NightInput[]>
  exits(
    tx: TxHandle,
    q: { stationId: string; date: LocalDate }
  ): Promise<{ value: number; readingId: string } | { pendingUntil: Instant }>
  baseline(
    tx: TxHandle,
    q: { stationId: string; date: LocalDate }
  ): Promise<{ value: number; readingIds: string[] } | null>
}

export interface ShiftConditions {
  // b-signals-api; 'unknown' counts as active.
  isActive(
    tx: TxHandle,
    q: { projectId: string; condition: 'storm_afternoon' | 'surge_night'; date: LocalDate }
  ): Promise<boolean | 'unknown'>
}

export interface ModelEntry {
  provider: string
  model: string
  keyId: string | null
  declaredTier: string
}

export interface ModelResolver {
  // e-byok-api; a null keyId selects platform Vertex.
  chain(tx: TxHandle, q: { orgId: string; accountId: string | null; unattended: boolean }): Promise<ModelEntry[]>
}

export interface BudgetGate {
  // d-guest-rules
  consume(
    tx: TxHandle,
    p: Principal,
    kind: 'run' | 'evidence' | 'window',
    tokens?: number
  ): Promise<{ ok: true } | { ok: false; resetsAt: Instant }>
}

export type Json = LedgerEntry['body']
export type AuditJson = Json
export type EventType = DomainEventType
export type EventData<T extends EventType> = Extract<DomainEvent, { type: T }>['data']
export type AnalyticsName = AnalyticsEventType
export type AnalyticsProps<N extends AnalyticsName> = Extract<AnalyticsEvent, { name: N }>['props']

// Spec §1 shared writes; f-db-schema unless another owner is named.
export type RecordAudit = (
  tx: TxHandle,
  e: {
    action: AuditAction
    target: { type: string; id: string }
    projectId?: string
    before?: AuditJson
    after?: AuditJson
  }
) => Promise<void>

export type EmitEvent = <T extends EventType>(
  tx: TxHandle,
  e: { projectId: string; type: T; data: EventData<T> }
) => Promise<{ id: string; seq: number }>

export type Track = <N extends AnalyticsName>(
  tx: TxHandle,
  name: N,
  props: AnalyticsProps<N>,
  ids?: { projectId?: string }
) => Promise<void>

// c-ledger-chain
export type AppendLedger = (
  tx: TxHandle,
  e: { projectId: string; kind: LedgerKind; refs: Record<string, string>; body: Json; corrects?: string }
) => Promise<{ id: string; seq: number; hash: string }>

// c-run-orchestrator
export type RequestRun = (
  tx: TxHandle,
  r: {
    projectId: string
    pack: Pack
    trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
    triggerRef?: string
    windowIds?: string[]
    nightIds?: string[]
    requestedBy?: Principal
    dedupeKey: string
    triggeredAt: Instant
  }
) => Promise<{ runId: string; coalescedInto?: string }>

export type ProjectGate = (tx: TxHandle, projectId: string) => Promise<'open' | 'archived' | 'suspended'>

// Spec §1 "Other cross-domain functions".
export type CreateOrganisation = (
  tx: TxHandle,
  o: { name: string; slug: string; ownerAccountId: string | null; plan?: Plan }
) => Promise<{ orgId: string }>

export type Notify = (
  tx: TxHandle,
  n: {
    accountIds: string[]
    kind: NotificationKind
    ref: { type: string; id: string }
    projectId?: string
    recovered?: true
  }
) => Promise<void>

export type RegisterAuditCheck = (c: {
  name: string
  scope?: 'org' | 'platform'
  run(
    tx: TxHandle,
    now: Instant
  ): Promise<Array<{ key: string; projectId: string | null; accountIds: string[]; ref: { type: string; id: string } }>>
}) => void

export type ListenEvents = (
  q: { orgId: string; projectIds: string[]; types: EventType[]; afterSeq?: number },
  cb: (e: EventEnvelope) => void
) => () => void

// Spec §3 subscriber_token.purpose.
export type SubscriberTokenPurpose = 'confirm' | 'manage' | 'unsubscribe' | 'reply' | 'feedback'
export type IssueSubscriberToken = (
  tx: TxHandle,
  t: { subscriberId: string; purpose: SubscriberTokenPurpose; callId?: string; windowId?: string }
) => Promise<string>

export type VerifySubscriberToken = (
  token: string,
  purpose: string
) => Promise<{
  orgId: string
  projectId: string
  subscriberId: string
  tokenId: string
  callId: string | null
  windowId: string | null
} | null>

export type EmailHash = (address: string) => string
export type EraseSubscriber = (tx: TxHandle, subscriberId: string) => Promise<void>
