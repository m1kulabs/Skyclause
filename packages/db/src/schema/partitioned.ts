import { sql } from 'drizzle-orm'
import { doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { instant } from './columns'

// `poll` and `reading` are range-partitioned by month (TRD), which drizzle-kit 0.31 can't emit, so schema/index.ts
// leaves this file out of drizzle-kit's view and migration 0004 creates both tables by hand. These definitions type
// the queries; schema.test.ts fails if they and the live columns differ. A column added here needs a `--custom`
// migration with the same `ALTER TABLE`, not `generate`.

/** One request's outcome for one bound source (TRD, D15). C, append-only, monthly partitions on `started_at`. */
export const poll = pgTable(
  'poll',
  {
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    sourceId: uuid('source_id').notNull(),
    requestId: uuid('request_id').notNull(),
    startedAt: instant('started_at').notNull(),
    httpStatus: integer('http_status'),
    latencyMs: integer('latency_ms').notNull(),
    outcome: text('outcome').notNull(),
    errorCode: text('error_code'),
    message: text('message'),
    purpose: text('purpose').notNull().default('poll'),
    bodySha256: text('body_sha256'),
    apiFamily: text('api_family'),
    receivedAt: instant('received_at')
  },
  (self) => [
    primaryKey({ columns: [self.id, self.startedAt] }),
    index('poll_request_id_idx').on(self.requestId),
    index('poll_source_purpose_started_at_idx').on(self.sourceId, self.purpose, self.startedAt.desc(), self.id.desc())
  ]
)

/**
 * One observation (TRD). C, append-only, monthly partitions on `observed_at`. Dedupes on (`source_id`, `metric`,
 * `observed_at`, `item_key`, `revision`); a changed re-fetch appends `revision + 1`. `poll_id` has no foreign key:
 * a partitioned `poll` is unique only on (`id`, `started_at`).
 */
export const reading = pgTable(
  'reading',
  {
    id: uuid('id')
      .notNull()
      .default(sql`uuidv7()`),
    sourceId: uuid('source_id').notNull(),
    pollId: uuid('poll_id'),
    metric: text('metric').notNull(),
    unit: text('unit'),
    observedAt: instant('observed_at').notNull(),
    receivedAt: instant('received_at').notNull().defaultNow(),
    value: doublePrecision('value'),
    valueText: text('value_text'),
    valueJson: jsonb('value_json'),
    deviceTime: instant('device_time'),
    itemKey: text('item_key').default(''),
    revision: integer('revision').notNull().default(0)
  },
  (self) => [primaryKey({ columns: [self.id, self.observedAt] }), index('reading_poll_id_idx').on(self.pollId)]
)
