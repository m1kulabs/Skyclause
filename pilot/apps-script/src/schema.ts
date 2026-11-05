// Every workbook tab and its column order, from the #47 spec "Workbook" table.
// Feature tickets don't change column order without editing #47 first.
export const TABS = [
  {
    name: 'sources',
    columns: [
      'source_id',
      'kind',
      'name',
      'cadence_min',
      'stale_after_min',
      'freshness',
      'licence',
      'url',
      'state',
      'state_since',
      'probation',
      'probation_n',
      'probation_agreement',
      'distance_km'
    ]
  },
  {
    name: 'polls',
    columns: [
      'poll_id',
      'source_kind',
      'source_id',
      'started_at',
      'received_at',
      'http_status',
      'latency_ms',
      'outcome',
      'new_rows',
      'error',
      'raw_file_id'
    ]
  },
  {
    name: 'readings',
    columns: [
      'reading_id',
      'source_kind',
      'source_id',
      'metric',
      'observed_at',
      'received_at',
      'value',
      'unit',
      'http_status',
      'latency_ms',
      'poll_id',
      'revision',
      'note'
    ]
  },
  {
    name: 'warnings',
    columns: [
      'warning_key',
      'issued',
      'title_en',
      'title_bm',
      'valid_from',
      'valid_to',
      'heading_en',
      'text_en',
      'instruction_en',
      'heading_bm',
      'text_bm',
      'instruction_bm',
      'first_seen_at',
      'last_seen_at',
      'poll_id',
      'http_status',
      'latency_ms',
      'names_kl'
    ]
  },
  {
    name: 'forecast',
    columns: [
      'date',
      'location_id',
      'morning_forecast',
      'afternoon_forecast',
      'night_forecast',
      'summary_forecast',
      'summary_when',
      'min_temp',
      'max_temp',
      'first_seen_at',
      'poll_id',
      'afternoon_thunderstorm'
    ]
  },
  {
    name: 'indicators',
    columns: ['snapshot_id', 'scope', 'name', 'value', 'unit', 'observed_at', 'age_min', 'state', 'reading_ids']
  },
  {
    name: 'now',
    columns: [
      'snapshot_id',
      'scope',
      'span_from',
      'span_to',
      'w.rain_max_60m_mm',
      'w.rain_max_4h_mm',
      'site.api_max',
      'site.api_max_station',
      'site.api_0600',
      'w.met_kl_warning_in_force',
      'w.met_warning_keys',
      'site.camera_far_ratio_last3',
      'site.gauge_rain_last3frames_mm',
      'age_min_gauge',
      'age_min_apims',
      'age_min_met',
      'age_min_camera',
      'state_gauge',
      'state_apims',
      'state_met',
      'state_camera',
      'site.met_afternoon_thunderstorm'
    ]
  },
  {
    name: 'shadow',
    columns: [
      'scope',
      'haze_watch',
      'haze_severe',
      'storm_watch',
      'storm_confirmed',
      'flash_flood_risk',
      'silent_input',
      'watch',
      'mode',
      'verdict',
      'blocked_inputs',
      'snapshot_id'
    ]
  },
  {
    name: 'crowd_shadow',
    columns: [
      'scope',
      'surge_night',
      'arrival_clash',
      'exit_clash',
      'after_last_shuttle',
      'single_source_listing',
      'silent_input',
      'verdict',
      'recommendations',
      'blocked_inputs',
      'snapshot_id'
    ]
  },
  { name: 'shadow_state', columns: ['scope', 'verdict', 'since', 'last_crossing_id'] },
  {
    name: 'clauses',
    columns: [
      'pack',
      'Clause',
      'Reads',
      'Fires when (default)',
      'Proposes',
      'key',
      'requires',
      'span_from',
      'span_to',
      'threshold',
      'op',
      'proposes_key',
      'rank',
      'wording_en',
      'enabled'
    ]
  },
  { name: 'clause_versions', columns: ['version_n', 'saved_at', 'editor', 'content_hash', 'content_json'] },
  {
    name: 'windows',
    columns: [
      'window_id',
      'subscriber_id',
      'kind',
      'date',
      'start_myt',
      'end_myt',
      'language',
      'status',
      'declared_at',
      'title'
    ]
  },
  {
    name: 'subscribers',
    columns: ['subscriber_id', 'email', 'role', 'language', 'consent_at', 'unsubscribed_at']
  },
  { name: 'rota', columns: ['date', 'start', 'end', 'approver', 'email', 'malay_reader'] },
  { name: 'notifications', columns: ['at', 'kind', 'to', 'ref', 'gmail_message_id'] },
  {
    name: 'evidence',
    columns: [
      'request_id',
      'received_at',
      'kind',
      'span_start',
      'span_end',
      'pack_json',
      'status',
      'drafted_at',
      'approved_at',
      'replied_at'
    ]
  },
  {
    name: 'ledger',
    columns: [
      'entry_id',
      'kind',
      'pack',
      'bundle_id',
      'call_id',
      // One column holding a window ID (Sky) or a night ID (Crowd); the header is the spec's wording.
      'window_id or night_id',
      'trigger',
      'source_ref',
      'mode',
      'fired',
      'agrees',
      'snapshot_id',
      'crossing_at',
      'drafted_at',
      'approved_at',
      'sent_at',
      'approver_on_duty',
      'recipient_ids',
      'jira_key',
      'calendar_event_url',
      'body',
      'corrects',
      'recorded_at',
      'hash'
    ]
  },
  {
    name: 'grades',
    columns: [
      'grade_id',
      'window_id',
      'call_id',
      'proposed_mode',
      'decision',
      'observed_mode',
      'outcome',
      'mode_diff',
      'shadow_fired_no_call',
      'explanation',
      'graded_at',
      'clause_version_hash'
    ]
  },
  {
    name: 'probation',
    columns: ['capture_id', 'frame_file_id', 'device_time', 'phone_flag', 'label_a', 'label_b', 'settled', 'agrees']
  },
  { name: 'glossary', columns: ['ms_phrase', 'en_gloss'] },
  { name: 'devices', columns: ['device_id', 'kind', 'last_heartbeat_at', 'last_row_at', 'state', 'state_since'] },
  {
    name: 'history',
    columns: ['night_date', 'venue', 'show', 'class', 'source_url', 'source_revision', 'label_a', 'label_b']
  },
  {
    name: 'listings',
    columns: [
      'listing_id',
      'night_date',
      'venue',
      'show',
      'class',
      'doors_myt',
      'show_myt',
      'show_end_myt',
      'sources',
      'source_url',
      'source_revision',
      'state',
      'single_source'
    ]
  },
  {
    name: 'forecasts',
    columns: [
      'forecast_id',
      'night_id',
      'listing_ids',
      'baseline',
      'uplift',
      'forecast',
      'band_low',
      'band_high',
      'band_method',
      'created_at',
      'provenance'
    ]
  },
  {
    name: 'crowd_grades',
    columns: ['grade_id', 'night_id', 'forecast_id', 'actual', 'outcome', 'ape', 'next_update', 'graded_at']
  }
] as const

export type Tab = (typeof TABS)[number]['name']
export type Column<T extends Tab> = Extract<(typeof TABS)[number], { name: T }>['columns'][number]
export type Cell = string | number | boolean | Date
export type Row<T extends Tab> = Partial<Record<Column<T>, Cell>>

export function columnsOf<T extends Tab>(tab: T): readonly Column<T>[] {
  const found = TABS.find((entry) => entry.name === tab)
  if (!found) throw new Error(`unknown tab ${tab}`)
  return found.columns as readonly string[] as readonly Column<T>[]
}

// One record as a sheet row in column order; missing columns are blank.
export function toRow<T extends Tab>(tab: T, record: Row<T>): Cell[] {
  const columns: readonly string[] = columnsOf(tab)
  for (const key of Object.keys(record)) {
    if (!columns.includes(key)) throw new Error(`${tab} has no column ${key}`)
  }
  const values = record as Record<string, Cell | undefined>
  return columns.map((column) => values[column] ?? '')
}
