import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { CallDetail } from '../../features/bundles/operations'
import { CallReview } from '../../features/bundles/call-review'

const sent: CallDetail = {
  id: 'sent',
  call_id: 'sent',
  bundle_id: 'bundle',
  project_id: 'project',
  trace_id: 'run',
  window_id: null,
  window: null,
  night_id: null,
  night: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: '',
  state: 'sent',
  shadow: {
    scope: { kind: 'site', id: null },
    pack: 'sky',
    mode: 'commute_disruption',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null
  },
  chosen: 'agent',
  agrees: true,
  decision: null,
  expires_at: '2026-11-02T07:30:00Z',
  triggered_at: '2026-11-02T07:05:00Z',
  drafted_at: '2026-11-02T07:06:00Z',
  approved_at: '2026-11-02T07:07:00Z',
  sent_at: '2026-11-02T07:08:00Z',
  superseded_by_call_id: null,
  ics_uid: 'test-sent',
  ics_sequence: 0,
  sheet_version_id: 'test-sheet',
  clauses: [],
  inputs: [],
  warnings: [],
  trace: [],
  approved_by: 'test-account',
  grade: null,
  permalink: 'https://skyclause.m1ku.tech/c/test-sent',
  deliveries: []
}

test('a sent call is never labelled expired and not sent after its deadline', () => {
  const html = renderToStaticMarkup(<CallReview call={sent} decision={{}} expired basePath="/test/project" />)
  expect(html).not.toContain('Expired, not sent')
})

test('a call review renders project strip readings when provided', () => {
  const call: CallDetail = {
    ...sent,
    window: {
      id: 'window',
      project_id: 'project',
      starts_at: '2026-11-02T07:30:00Z',
      ends_at: '2026-11-02T09:30:00Z',
      title: 'Release wave',
      kind: 'commute_wave',
      tz: 'Asia/Kuala_Lumpur',
      declared_by: 'test-account',
      guest: false,
      via: 'app',
      expires_at: null,
      series_id: null,
      ics_feed_id: null,
      cancelled_at: null,
      share_link_id: null,
      moderation: 'visible'
    }
  }
  const strip = {
    from: '2026-11-02T06:00:00Z',
    to: '2026-11-02T08:00:00Z',
    now: '2026-11-02T08:05:00Z',
    rain5: [{ at: '2026-11-02T07:00:00Z', value: 9.5, state: 'received' as const }],
    rain60: [{ at: '2026-11-02T07:00:00Z', value: 39 }]
  }

  const html = renderToStaticMarkup(
    <CallReview call={call} decision={{}} expired={false} basePath="/test/project" strip={strip} />
  )

  expect(html).not.toContain('No readings yet (n=0)')
  expect(html).toContain('2 readings.')
  expect(html).toContain('data-strip-plot')
})

test('fired clauses lead with the wording in the interface’s language and never print a clause key', () => {
  const fired: CallDetail = {
    ...sent,
    fired: [
      { clause: 'storm_confirmed', inputs: [] },
      { clause: 'gate_queue_long', inputs: [] }
    ],
    clauses: [
      {
        key: 'storm_confirmed',
        result: 'fired',
        blocked_by: [],
        inputs: [],
        cel: 'true',
        wording: { en: 'Storm confirmed over the campus', ms: 'Ribut disahkan di kampus' }
      }
    ]
  } as CallDetail
  const malay = renderToStaticMarkup(
    <CallReview call={fired} decision={{}} expired={false} basePath="/test/project" locale="ms" />
  )
  expect(malay).toMatch(/class="bundle-clause-name">Ribut disahkan di kampus</)
  // The other language's wording, which goes out too, follows marked as English.
  expect(malay).toContain('lang="en">Storm confirmed over the campus<')
  // A clause with no explanation reads as words, never as its key.
  expect(malay).toContain('Gate queue long')
  expect(malay).not.toContain('gate_queue_long')
  const english = renderToStaticMarkup(
    <CallReview call={fired} decision={{}} expired={false} basePath="/test/project" locale="en" />
  )
  expect(english).toMatch(/class="bundle-clause-name">Storm confirmed over the campus</)
  expect(english).toContain('lang="ms">Ribut disahkan di kampus<')
})

test('a window still ahead is drawn past now on the strip, and the summary says it has not started', () => {
  const call: CallDetail = {
    ...sent,
    state: 'drafted',
    window: {
      id: 'ahead',
      project_id: 'project',
      // 07:29–08:29 MYT, reviewed at 06:59 MYT.
      starts_at: '2026-11-12T23:29:00Z',
      ends_at: '2026-11-13T00:29:00Z',
      title: 'Open-air lecture',
      kind: 'class',
      tz: 'Asia/Kuala_Lumpur',
      declared_by: 'test-account',
      guest: false,
      via: 'app',
      expires_at: null,
      series_id: null,
      ics_feed_id: null,
      cancelled_at: null,
      share_link_id: null,
      moderation: 'visible'
    }
  }
  // The read strip ends at now.
  const strip = {
    from: '2026-11-12T17:00:00Z',
    to: '2026-11-12T22:59:00Z',
    now: '2026-11-12T22:59:00Z',
    rain5: [{ at: '2026-11-12T22:55:00Z', value: 0.5, state: 'received' as const }],
    rain60: [{ at: '2026-11-12T22:55:00Z', value: 1.5 }]
  }
  const html = renderToStaticMarkup(
    <CallReview call={call} decision={{}} expired={false} basePath="/test/project" strip={strip} />
  )
  // The window's capsule, drawn as the draft it is.
  expect(html).toMatch(/data-window="ahead"[^>]*data-draft="true"/)
  expect(html).toContain('Live strip to 06:59 MYT. The window starts at 07:29 MYT.')
  expect(html).not.toContain('No Lebat crossing in this window')
})
