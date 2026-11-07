import { expect, test } from 'bun:test'
import { buildEvidencePack, serializeEvidencePack } from './evidence-pack.ts'
import { projectEvidenceRows, type EvidenceStoredRows } from './evidence-projections.ts'
import { parseEvidenceRequest } from './evidence-request.ts'
import type { Cell, Row } from './schema.ts'

const secret = 'PRIVATE-name-title-email@example.invalid'
const at = '2026-11-02T15:00:00+08:00'
const context = { projectSlug: 'test-only-projection', receivedAt: at, assembledAt: at }

test('projection rebuilds every public DTO and removes private columns, extra keys and nested secrets before serialization', () => {
  const rows: EvidenceStoredRows = {
    readings: [
      {
        source_id: 'cam-1',
        source_kind: 'camera',
        metric: 'flag',
        unit: '',
        observed_at: at,
        received_at: at,
        value: 'visible',
        revision: 1,
        note: secret,
        email: secret
      } as Row<'readings'>
    ],
    warnings: [
      {
        warning_key: 'test-warning',
        title_en: 'Thunderstorms Warning',
        text_en: 'Public text stays verbatim',
        issued: at,
        first_seen_at: at,
        valid_from: at,
        valid_to: at,
        names_kl: true,
        private: secret
      } as Row<'warnings'>
    ],
    forecast: [
      { date: '2026-11-02', first_seen_at: at, afternoon_forecast: 'Ribut petir', private: secret } as Row<'forecast'>
    ],
    glossary: [{ ms_phrase: 'Ribut petir', en_gloss: 'Thunderstorms', private: secret } as Row<'glossary'>],
    windows: [
      {
        window_id: 'test-window',
        subscriber_id: 'test-subscriber-id',
        date: '2026-11-02',
        start_myt: '14:00',
        end_myt: '16:00',
        title: secret,
        private: secret
      } as Row<'windows'>
    ],
    now: [{ snapshot_id: at, scope: 'test-window', 'site.api_max': 42, private: secret } as Row<'now'>],
    ledger: [
      {
        entry_id: 'test-ledger',
        'window_id or night_id': 'test-window',
        kind: 'crossing',
        crossing_at: at,
        approver_on_duty: secret,
        recipient_ids: secret,
        calendar_event_url: secret,
        body: JSON.stringify({ nested: { secret } }),
        fired: JSON.stringify([{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'], private: { secret } }]),
        private: secret
      } as Row<'ledger'>,
      {
        entry_id: 'test-version',
        kind: 'clause_version',
        crossing_at: at,
        body: JSON.stringify({ version_n: 2, content_hash: 'a'.repeat(64), private: secret, nested: { secret } })
      }
    ],
    grades: [
      {
        grade_id: 'test-grade',
        window_id: 'test-window',
        outcome: 'correct',
        explanation: JSON.stringify({ secret }),
        private: secret
      } as Row<'grades'>
    ],
    probation: [
      {
        frame_file_id: 'test-frame',
        device_time: at,
        phone_flag: secret,
        label_a: secret,
        private: secret
      } as Row<'probation'>
    ]
  }
  const projected = projectEvidenceRows(rows)
  expect(JSON.stringify(projected)).not.toContain(secret)
  const result = buildEvidencePack(
    parseEvidenceRequest({ subject: 'call for today', body: '', receivedAt: at }),
    context,
    projected
  )
  const json = serializeEvidencePack('call', result).packJson
  expect(json).not.toContain(secret)
  expect(json).toContain('Public text stays verbatim')
  if (!('ledger' in result)) throw new Error('expected call pack')
  expect(result.ledger[0]).not.toHaveProperty('body')
  expect(result.ledger[0]?.fired).toBe(JSON.stringify([{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }]))
  expect(result.ledger[1]?.body).toEqual({ version_n: 2, content_hash: 'a'.repeat(64) })
})

test('malformed clause bodies and non-scalar values cannot cross the projection boundary', () => {
  const invalid = { nested: secret } as unknown as Cell
  const rows: EvidenceStoredRows = {
    readings: [],
    warnings: [],
    forecast: [],
    glossary: [],
    windows: [],
    now: [],
    grades: [],
    probation: [],
    ledger: [
      { kind: 'clause_version', body: JSON.stringify({ version_n: '2', content_hash: secret }), mode: invalid },
      { kind: 'clause_version', body: '{broken' },
      { kind: 'clause_version', body: JSON.stringify({ version_n: 2, content_hash: 'not hex' }) }
    ]
  }
  const projected = projectEvidenceRows(rows)
  expect(JSON.stringify(projected)).not.toContain(secret)
  expect(projected.ledger.every((entry) => entry.body === undefined)).toBe(true)
})

test('now projection preserves numeric rain and rebuilds only public fields inside camera JSON', () => {
  const projected = projectEvidenceRows({
    readings: [],
    warnings: [],
    forecast: [],
    glossary: [],
    windows: [],
    grades: [],
    probation: [],
    ledger: [],
    now: [
      {
        scope: 'test-window',
        snapshot_id: at,
        'site.gauge_rain_last3frames_mm': 3.5,
        'site.camera_far_ratio_last3': JSON.stringify([{ value: 0.8, observed_at: at, nested: { secret } }])
      }
    ]
  })
  expect(projected.now[0]?.['site.gauge_rain_last3frames_mm']).toBe(3.5)
  expect(projected.now[0]?.['site.camera_far_ratio_last3']).toBe(JSON.stringify([{ value: 0.8, observed_at: at }]))
  expect(JSON.stringify(projected)).not.toContain(secret)
})

test('now warning-key lists preserve public IDs and reject nested objects', () => {
  const projected = projectEvidenceRows({
    readings: [],
    warnings: [],
    forecast: [],
    glossary: [],
    windows: [],
    grades: [],
    probation: [],
    ledger: [],
    now: [{ 'w.met_warning_keys': '["test-warning"]' }, { 'w.met_warning_keys': JSON.stringify([{ private: secret }]) }]
  })
  expect(projected.now[0]?.['w.met_warning_keys']).toBe('["test-warning"]')
  expect(projected.now[1]?.['w.met_warning_keys']).toBeNull()
  expect(JSON.stringify(projected)).not.toContain(secret)
})
