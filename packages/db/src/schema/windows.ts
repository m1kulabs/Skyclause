import { sql } from 'drizzle-orm'
import { boolean, check, date, doublePrecision, jsonb, text, time, unique, uuid } from 'drizzle-orm/pg-core'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { listingState, moderation, nightState, shareAccess, windowKind, windowVia } from './enums'
import { project } from './project'

// TRD entities and #79 §3 rows for `b-windows-api`, `d-guest-rules`, `d-guest-lifecycle`, `b-share-links`,
// `b-listings` and `b-forecast`. All T.

/** A project shared by expiring link; `access` is TRD's `role`. */
export const shareLink = tenantTable(
  'share_link',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    access: shareAccess('access').notNull(),
    expiresAt: instant('expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    ...timestamps()
  },
  (self) => [orgKey('share_link', self), sameOrg('share_link_project', self, self.projectId, project, true)]
)

/** A recurring window's rule; series materialise 90 days ahead (D13). */
export const windowSeries = tenantTable(
  'window_series',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    rule: jsonb('rule').notNull(),
    localStart: time('local_start').notNull(),
    localEnd: time('local_end').notNull(),
    materialisedUntil: date('materialised_until'),
    definition: jsonb('definition'),
    icsFeedId: uuid('ics_feed_id'),
    icsUid: text('ics_uid'),
    checkedOn: date('checked_on'),
    cancelledAt: instant('cancelled_at'),
    lastError: text('last_error'),
    ...timestamps()
  },
  (self) => [
    orgKey('window_series', self),
    sameOrg('window_series_project', self, self.projectId, project, true),
    sameOrg('window_series_ics_feed', self, self.icsFeedId, icsFeed),
    unique('window_series_import_identity_key').on(self.icsFeedId, self.icsUid),
    check(
      'window_series_import_identity_check',
      sql`(${self.icsFeedId} IS NULL AND ${self.icsUid} IS NULL) OR (${self.icsFeedId} IS NOT NULL AND ${self.icsUid} IS NOT NULL AND octet_length(${self.icsUid}) BETWEEN 1 AND 1024)`
    ),
    check(
      'window_series_definition_check',
      sql`${self.definition} IS NULL OR (jsonb_typeof(${self.definition}) = 'object' AND coalesce(${self.definition}->'version' = '1'::jsonb, false))`
    )
  ]
)

/** A subscribed or uploaded ICS calendar and its refresh state. */
export const icsFeed = tenantTable(
  'ics_feed',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    url: text('url'),
    filename: text('filename'),
    etag: text('etag'),
    lastModified: text('last_modified'),
    refreshedAt: instant('refreshed_at'),
    kind: windowKind('kind').notNull().default('class'),
    document: jsonb('document'),
    provenance: jsonb('provenance'),
    lastAttemptAt: instant('last_attempt_at'),
    nextRefreshAt: instant('next_refresh_at'),
    refreshClaim: uuid('refresh_claim'),
    lastError: text('last_error'),
    deletedAt: instant('deleted_at'),
    skipped: jsonb('skipped')
      .notNull()
      .default(sql`'[]'::jsonb`),
    materialisedUntil: date('materialised_until'),
    ...timestamps()
  },
  (self) => [
    orgKey('ics_feed', self),
    sameOrg('ics_feed_project', self, self.projectId, project, true),
    check(
      'ics_feed_document_check',
      sql`${self.document} IS NULL OR (jsonb_typeof(${self.document}) = 'object' AND coalesce(${self.document}->'version' = '1'::jsonb, false) AND coalesce(jsonb_typeof(${self.document}->'jcal') = 'array', false))`
    ),
    check(
      'ics_feed_provenance_check',
      sql`${self.provenance} IS NULL OR (jsonb_typeof(${self.provenance}) = 'object' AND coalesce(${self.provenance}->'version' = '1'::jsonb, false))`
    ),
    check('ics_feed_skipped_check', sql`jsonb_typeof(${self.skipped}) = 'array'`)
  ]
)

/** A declared time window (TRD); a zero-length `commute_wave` is valid (D13). */
export const window = tenantTable(
  'window',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    title: text('title').notNull(),
    kind: windowKind('kind').notNull(),
    tz: text('tz').notNull(),
    declaredBy: text('declared_by').notNull(),
    guest: boolean('guest').notNull().default(false),
    via: windowVia('via').notNull(),
    expiresAt: instant('expires_at'),
    seriesId: uuid('series_id'),
    icsFeedId: uuid('ics_feed_id'),
    cancelledAt: instant('cancelled_at'),
    cancellationOrigin: text('cancellation_origin').$type<'manual' | 'series' | 'source'>(),
    seriesOccurrenceDate: date('series_occurrence_date'),
    icsUid: text('ics_uid'),
    icsRecurrenceId: text('ics_recurrence_id'),
    localOverride: boolean('local_override').notNull().default(false),
    shareLinkId: uuid('share_link_id'),
    guestDeviceHash: text('guest_device_hash'),
    guestIpHash: text('guest_ip_hash'),
    moderation: moderation('moderation').notNull().default('visible'),
    ...timestamps()
  },
  (self) => [
    orgKey('window', self),
    sameOrg('window_project', self, self.projectId, project, true),
    sameOrg('window_series', self, self.seriesId, windowSeries),
    sameOrg('window_ics_feed', self, self.icsFeedId, icsFeed),
    sameOrg('window_share_link', self, self.shareLinkId, shareLink),
    unique('window_native_identity_key').on(self.seriesId, self.seriesOccurrenceDate),
    unique('window_import_identity_key').on(self.icsFeedId, self.icsUid, self.icsRecurrenceId),
    check(
      'window_native_identity_check',
      sql`${self.seriesOccurrenceDate} IS NULL OR (${self.seriesId} IS NOT NULL AND ${self.icsFeedId} IS NULL)`
    ),
    check(
      'window_import_identity_check',
      sql`(${self.icsUid} IS NULL AND ${self.icsRecurrenceId} IS NULL) OR (${self.icsFeedId} IS NOT NULL AND ${self.icsUid} IS NOT NULL AND ${self.icsRecurrenceId} IS NOT NULL AND octet_length(${self.icsUid}) BETWEEN 1 AND 1024 AND octet_length(${self.icsRecurrenceId}) <= 1024)`
    ),
    check(
      'window_cancellation_origin_check',
      sql`${self.cancellationOrigin} IS NULL OR (${self.cancelledAt} IS NOT NULL AND ${self.cancellationOrigin} IN ('manual', 'series', 'source'))`
    )
  ]
)

/** A visitor's report on a guest window (`d-guest-lifecycle`), one per device. */
export const windowReport = tenantTable(
  'window_report',
  {
    id: id(),
    windowId: uuid('window_id').notNull(),
    deviceHash: text('device_hash').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('window_report_window', self, self.windowId, window, true),
    unique('window_report_window_id_device_hash_key').on(self.windowId, self.deviceHash)
  ]
)

/** A Crowd night (`b-forecast`; `graded` and `unlisted` by `c-grades`, D27). Exit times are null until known. */
export const night = tenantTable(
  'night',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    date: date('date').notNull(),
    state: nightState('state').notNull().default('upcoming'),
    doors: instant('doors'),
    show: instant('show'),
    arrivalStart: instant('arrival_start'),
    arrivalEnd: instant('arrival_end'),
    exitStart: instant('exit_start'),
    exitEnd: instant('exit_end'),
    ...timestamps()
  },
  (self) => [orgKey('night', self), sameOrg('night_project', self, self.projectId, project, true)]
)

/** A venue listing (`b-listings`, D27); `pending_change` holds a proposed change awaiting approval. */
export const listing = tenantTable(
  'listing',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    listingKey: text('listing_key').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceRevision: text('source_revision').notNull(),
    state: listingState('state').notNull().default('proposed'),
    class: text('class').notNull(),
    classHint: text('class_hint'),
    singleSource: boolean('single_source').notNull().default(false),
    historical: boolean('historical').notNull().default(false),
    nightId: uuid('night_id'),
    pendingChange: jsonb('pending_change'),
    ...timestamps()
  },
  (self) => [
    orgKey('listing', self),
    sameOrg('listing_project', self, self.projectId, project, true),
    sameOrg('listing_night', self, self.nightId, night),
    unique('listing_project_id_listing_key_key').on(self.projectId, self.listingKey)
  ]
)

/** A night's forecast (`b-forecast`); append-only, so each provably predates its night. */
export const forecast = tenantTable(
  'forecast',
  {
    id: id(),
    nightId: uuid('night_id').notNull(),
    baseline: doublePrecision('baseline').notNull(),
    uplift: doublePrecision('uplift').notNull(),
    forecast: doublePrecision('forecast').notNull(),
    bandLow: doublePrecision('band_low').notNull(),
    bandHigh: doublePrecision('band_high').notNull(),
    method: text('method').notNull(),
    // Readings' IDs: a partitioned `reading` can't be a foreign key target by `id` alone.
    readingIds: uuid('reading_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [sameOrg('forecast_night', self, self.nightId, night, true)]
)
