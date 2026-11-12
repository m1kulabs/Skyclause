import type { Tx } from '../client'
import type { icsFeed, windowSeries } from '../schema'
import type { WindowChange, WindowMutationInsert, WindowRow, WindowSeriesRow } from '../windows'
import type { IcsFeedRow } from './feeds'

export type IcsSeriesCreate = Omit<typeof windowSeries.$inferInsert, 'orgId' | 'id'> & { id: string }
export type IcsSeriesPatch = Partial<
  Pick<
    typeof windowSeries.$inferInsert,
    'rule' | 'definition' | 'localStart' | 'localEnd' | 'materialisedUntil' | 'checkedOn' | 'lastError'
  >
>
export type IcsFeedPatch = Partial<
  Pick<
    typeof icsFeed.$inferInsert,
    | 'document'
    | 'etag'
    | 'lastModified'
    | 'refreshedAt'
    | 'lastError'
    | 'skipped'
    | 'materialisedUntil'
    | 'deletedAt'
    | 'refreshClaim'
    | 'nextRefreshAt'
  >
>
type WithoutCalendar<C> = C extends WindowChange ? Omit<C, 'calendar'> : never
export type IcsFeedWindowChange = WithoutCalendar<WindowChange>
export interface IcsFeedState {
  readonly feed: Readonly<IcsFeedRow>
  readonly series: readonly WindowSeriesRow[]
  readonly members: readonly WindowRow[]
}
export interface IcsFeedPlan {
  seriesCreates?: IcsSeriesCreate[]
  seriesUpdates?: Array<{ id: string; patch: IcsSeriesPatch }>
  changes: IcsFeedWindowChange[]
  feedPatch?: IcsFeedPatch
}
export interface IcsFeedMutation {
  feedId: string
  claimId?: string
  now: Date
  /** Real same-Tx per-created-window budget consumption; invoked only after the complete plan is validated. */
  beforeApply?: (creates: readonly WindowMutationInsert[], tx: Tx) => Promise<void>
}
export type IcsFeedApplyResult = { status: 'stale' } | { status: 'applied'; feed: IcsFeedRow; changedIds: string[] }
export interface IcsFeedClaim {
  orgId: string
  projectId: string
  feedId: string
  claimId: string
  url: string | null
  etag: string | null
  lastModified: string | null
}
export interface IcsFeedClaimOptions {
  projectId: string
  now: Date
  /** Defaults to one immediately attemptable feed; hard maximum ten. */
  limit?: number
  /** File feeds are eligible only when explicitly requested and their persisted due time has arrived. */
  includeFiles?: boolean
}
export const ICS_FEED_ERRORS = {
  'unsafe-url': 'The calendar URL is unavailable.',
  'fetch-failed': 'The calendar could not be fetched.',
  'parse-failed': 'The calendar could not be parsed.',
  'missing-document': 'The calendar has no confirmed document.',
  unavailable: 'The calendar source is unavailable.'
} as const
export type IcsFeedErrorCode = keyof typeof ICS_FEED_ERRORS
