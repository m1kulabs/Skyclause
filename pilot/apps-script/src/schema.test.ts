import { describe, expect, test } from 'bun:test'
import { TABS, columnsOf, toRow, type Tab } from './schema.ts'

// Each tab's "Columns in order" cell from the #47 spec "Workbook" table, pasted verbatim.
// When the spec changes, paste the new cell here and update schema.ts to match.
const SPEC: [string, string][] = [
  [
    'sources',
    'source_id, kind (`jps_rain`, `met_warning`, `met_forecast`, `apims`, `camera`, `rapidrail_od`, `pi`, `listing`), name, cadence_min, stale_after_min, freshness (`observed` or `polled`), licence, url, state (`fresh`, `stale`, `error`, `recovered`, `probation`, `off_hours`), state_since, probation, probation_n, probation_agreement, distance_km'
  ],
  [
    'polls',
    'append-only: poll_id, source_kind, source_id, started_at, received_at, http_status (0 = exception), latency_ms, outcome (`ok`, `unchanged`, `error`), new_rows, error, raw_file_id'
  ],
  [
    'readings',
    'append-only: reading_id, source_kind, source_id, metric (`rain_5m_mm`, `api`, `contrast_near`, `contrast_far`, `flag`, `sp17_exits`, `t580_leg_s`), observed_at, received_at, value, unit, http_status, latency_ms, poll_id, revision, note (JSON of source extras: APIMS class, camera capture_id, Pi header_age_s and posted_at)'
  ],
  [
    'warnings',
    'append-only: warning_key (`issued·title_en·valid_from`), issued, title_en, title_bm, valid_from, valid_to, heading_en, text_en, instruction_en, heading_bm, text_bm, instruction_bm, first_seen_at, last_seen_at, poll_id, http_status, latency_ms, names_kl'
  ],
  [
    'forecast',
    'append-only: date, location_id (`Ds058`), morning_forecast, afternoon_forecast, night_forecast, summary_forecast, summary_when, min_temp, max_temp, first_seen_at, poll_id, afternoon_thunderstorm'
  ],
  [
    'indicators',
    'append-only log: snapshot_id (= t_eval), scope (`site` or a window ID), name, value, unit, observed_at, age_min, state, reading_ids'
  ],
  [
    'now',
    'one row per scope, rewritten each tick: snapshot_id, scope, span_from, span_to, w.rain_max_60m_mm, w.rain_max_4h_mm, site.api_max, site.api_max_station, site.api_0600 (JSON of the last three 06:00 readings per station), w.met_kl_warning_in_force, w.met_warning_keys, site.camera_far_ratio_last3, site.gauge_rain_last3frames_mm, age_min_gauge, age_min_apims, age_min_met, age_min_camera, state_gauge, state_apims, state_met, state_camera, site.met_afternoon_thunderstorm'
  ],
  [
    'shadow',
    'one row per scope, rewritten each tick: scope, haze_watch, haze_severe, storm_watch, storm_confirmed, flash_flood_risk, silent_input (each `fired`, `not` or `blocked:{input}`), watch, mode, verdict (`{mode}` or `no_call`), blocked_inputs, snapshot_id'
  ],
  [
    'crowd_shadow',
    'one row per listed night, rewritten each tick: scope (night ID), surge_night, arrival_clash, exit_clash, after_last_shuttle, single_source_listing, silent_input (each `fired`, `not` or `blocked:{input}`), verdict (`surge_night`, `normal` or `no_call`), recommendations, blocked_inputs, snapshot_id'
  ],
  ['shadow_state', 'scope, verdict, since, last_crossing_id'],
  [
    'clauses',
    'pack, Clause, Reads, Fires when (default), Proposes (verbatim PRD text), key, requires, span_from, span_to, threshold (a number, or JSON when a clause has several conditions), op, proposes_key, rank, wording_en, enabled'
  ],
  ['clause_versions', 'append-only: version_n, saved_at, editor, content_hash, content_json'],
  [
    'windows',
    'window_id, subscriber_id, kind (`class`, `event`, `commute_wave`), date, start_myt, end_myt, language (`en`), status (`active`, `cancelled`), declared_at, title. **Agents read columns A–I only.**'
  ],
  [
    'subscribers',
    'subscriber_id, email, role, language, consent_at, unsubscribed_at. **No agent node reads this tab before approval.**'
  ],
  ['rota', 'date, start, end, approver, email, malay_reader'],
  [
    'notifications',
    'append-only: at, kind (`crossing`, `needs_review_expected`, `feed_silent`, `feed_recovered`, `no_bundle_20min`, `credentials_day12`, `pi_offline`, `pi_recovered`, `evidence_request`, `cal3_mismatch`), to, ref, gmail_message_id'
  ],
  [
    'evidence',
    'request_id (Gmail message ID), received_at, kind (`evidence`, `call`, `unsubscribe`, `unparseable`), span_start, span_end, pack_json, status (`parsed`, `drafted`, `approved`, `replied`, `rejected`), drafted_at, approved_at, replied_at'
  ],
  [
    'ledger',
    'append-only: entry_id, kind (`call_approved`, `call_edited`, `call_rejected`, `notice_sent`, `evidence_reply`, `surge_night_listed`, `listing_change`, `clause_version`), pack, bundle_id, call_id, window_id or night_id, trigger (`schedule`, `crossing`, `request`), source_ref (crossing or request ID), mode, fired (JSON), agrees (`Y` or `N:{shadow verdict}`), snapshot_id, crossing_at, drafted_at, approved_at, sent_at, approver_on_duty, recipient_ids, jira_key, calendar_event_url, body (call JSON), corrects, recorded_at, hash'
  ],
  [
    'grades',
    'append-only: grade_id, window_id, call_id, proposed_mode, decision (`approved`, `edited`, `rejected`, `expired`, `none`), observed_mode, outcome (`hit`, `miss`, `false_alarm`, `correct_normal`, `no_call`), mode_diff, shadow_fired_no_call, explanation, graded_at, clause_version_hash'
  ],
  ['probation', 'capture_id, frame_file_id, device_time, phone_flag, label_a, label_b, settled, agrees'],
  [
    'glossary',
    'ms_phrase, en_gloss (from [DESIGN voice and content](https://github.com/m1kulabs/Skyclause/blob/main/docs/DESIGN.md#voice-and-content))'
  ],
  ['devices', 'device_id, kind (`camera`, `pi`), last_heartbeat_at, last_row_at, state, state_since'],
  [
    'history',
    'night_date, venue, show, class (`stadium_concert`, `stadium_football`, `arena_show`, `other`), source_url, source_revision, label_a, label_b'
  ],
  [
    'listings',
    'listing_id, night_date, venue, show, class, doors_myt, show_myt, show_end_myt, sources (JSON), source_url, source_revision, state (`proposed`, `approved`, `listed`, `changed`, `cancelled`), single_source'
  ],
  [
    'forecasts',
    'append-only: forecast_id, night_id, listing_ids, baseline, uplift, forecast, band_low, band_high, band_method (`uplift_p10_p90` or `relerr_p10_p90_v1`), created_at, provenance'
  ],
  [
    'crowd_grades',
    'append-only: grade_id, night_id, forecast_id, actual, outcome (`pending`, `in_band`, `out_of_band`, `unlisted_surge`, `no_surge`), ape, next_update, graded_at'
  ]
]

// The PRD clause table's own header keeps its parenthetical.
const VERBATIM_HEADERS = ['Fires when (default)']
const PREFIXES = [
  'append-only: ',
  'append-only log: ',
  'one row per scope, rewritten each tick: ',
  'one row per listed night, rewritten each tick: '
]

function specColumns(cell: string): string[] {
  let text = cell.replace(/\s*\*\*[^*]+\*\*/g, '').trim()
  for (const prefix of PREFIXES) if (text.startsWith(prefix)) text = text.slice(prefix.length)
  const items: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      items.push(current)
      current = ''
    } else current += char
  }
  items.push(current)
  return items.map((item) => {
    const trimmed = item.trim().replace(/\.$/, '')
    if (VERBATIM_HEADERS.includes(trimmed)) return trimmed
    const paren = trimmed.indexOf(' (')
    return paren === -1 ? trimmed : trimmed.slice(0, paren)
  })
}

describe('workbook schema', () => {
  test('declares the 26 spec tabs in spec order', () => {
    expect(TABS.map((tab): string => tab.name)).toEqual(SPEC.map(([name]) => name))
    expect(TABS).toHaveLength(26)
  })

  for (const [name, cell] of SPEC) {
    test(`${name} columns match the spec, in order`, () => {
      const columns: readonly string[] = columnsOf(name as Tab)
      expect([...columns]).toEqual(specColumns(cell))
    })
  }

  test('agents reading windows A–I see every column but title', () => {
    const windows = columnsOf('windows')
    expect(windows.slice(0, 9)).not.toContain('title')
    expect(windows[9]).toBe('title')
  })

  test('toRow orders a record by the tab columns and blanks the rest', () => {
    expect(toRow('shadow_state', { since: '2026-11-02T15:05:00+08:00', scope: 'W-0001', verdict: 'normal' })).toEqual([
      'W-0001',
      'normal',
      '2026-11-02T15:05:00+08:00',
      ''
    ])
  })

  test('toRow refuses a key the tab does not have', () => {
    expect(() => toRow('shadow_state', { scope: 'W-0001', verdcit: 'normal' } as never)).toThrow(
      'shadow_state has no column verdcit'
    )
  })
})
