import { sql } from 'drizzle-orm'
import { boolean, date, doublePrecision, jsonb, text, time, unique, uuid } from 'drizzle-orm/pg-core'
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
    ...timestamps()
  },
  (self) => [orgKey('window_series', self), sameOrg('window_series_project', self, self.projectId, project, true)]
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
    ...timestamps()
  },
  (self) => [orgKey('ics_feed', self), sameOrg('ics_feed_project', self, self.projectId, project, true)]
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
    sameOrg('window_share_link', self, self.shareLinkId, shareLink)
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
