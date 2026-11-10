import type { CallView, InputValue, Mode } from '@skyclause/contracts'

// #152: `CallView` test doubles with the 2 November 2026 replay's numbers (JPS gauge 0232901RF, 39.0 mm in 60 min to
// 15:00 MYT, read by the 15:05 poll), and the context a sender passes with them.

export const SAFETY = {
  en: 'Skyclause is not a safety or emergency service. In an emergency, call 999.',
  ms: 'Skyclause bukan perkhidmatan keselamatan atau kecemasan. Jika berlaku kecemasan, hubungi 999.'
}

export const rain: InputValue = {
  name: 'site.rain_60m_mm',
  value: 39,
  unit: 'mm',
  state: 'fresh',
  since: '2026-11-02T06:05:00Z',
  age_s: 300,
  source_ids: ['source-jps'],
  source_url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
  reading_ids: ['reading-1500'],
  observed_at: '2026-11-02T07:00:00Z'
}

export function callView(o: { mode?: Mode | null; pack?: 'sky' | 'crowd' } & Partial<CallView> = {}): CallView {
  const { pack = 'sky', mode = 'commute_disruption', ...rest } = o
  return {
    id: '0196f0c2-0000-7000-8000-000000000001',
    bundle_id: '0196f0c2-0000-7000-8000-0000000000b1',
    window_id: '0196f0c2-0000-7000-8000-0000000000a1',
    night_id: null,
    mode,
    watch: false,
    no_call: null,
    fired: [{ clause: 'storm_confirmed', inputs: ['site.rain_60m_mm'] }],
    recommendations: [],
    recipients: [],
    notices: [
      { language: 'en', subject: 'Model subject, never sent', body: 'Why: Storm confirmed. The gauge logged 39.0 mm.' },
      { language: 'ms', subject: 'Subjek model', body: 'Sebab: Ribut disahkan. Tolok mencatat 39.0 mm.' }
    ],
    reason: 'Gauge over the Lebat line.',
    state: 'sent',
    shadow: {
      scope: { kind: 'window', id: '0196f0c2-0000-7000-8000-0000000000a1' },
      pack,
      mode,
      watch: false,
      no_call: null,
      recommendations: [],
      clauses: [{ key: 'storm_confirmed', result: 'fired', blocked_by: [], inputs: [rain] }],
      open_from: null
    },
    chosen: 'agent',
    agrees: true,
    decision: null,
    expires_at: '2026-11-02T08:30:00Z',
    triggered_at: '2026-11-02T07:05:00Z',
    drafted_at: '2026-11-02T07:05:30Z',
    approved_at: '2026-11-02T07:08:00Z',
    sent_at: '2026-11-02T07:08:05Z',
    superseded_by_call_id: null,
    ics_uid: 'call-0196f0c2-0000-7000-8000-000000000001@skyclause.m1ku.tech',
    ics_sequence: 0,
    ...rest
  }
}

export const PERMALINK = 'https://skyclause.m1ku.tech/c/0196f0c2-0000-7000-8000-000000000001'
export const LINKS = {
  permalink: PERMALINK,
  preferences: 'https://skyclause.m1ku.tech/subscribe/manage-token',
  unsubscribe: 'https://skyclause.m1ku.tech/subscribe/unsubscribe-token/unsubscribe'
}
// The 15:30 release wave on 2 November 2026, 15:30–16:30 MYT.
export const CONTEXT = {
  project: { name: 'Bukit Jalil' },
  window: { startsAt: '2026-11-02T07:30:00Z', endsAt: '2026-11-02T08:30:00Z' },
  approver: { role: 'approver' as const },
  sources: [{ name: 'JPS gauge 0232901RF', licence: 'JPS Infobanjir, terms unpublished' }]
}
