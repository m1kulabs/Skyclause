import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Mode } from '@skyclause/contracts'
import { describe, expect, test } from 'vitest'
import { REPLAY_2_NOVEMBER, renderReplayPreview } from '../src/notices'

// #152 NTC-7: before a project's first sent call, a Sky preview fills only the measured parts of the labelled
// 2 November 2026 replay (DESIGN "Known gaps") and leaves every other field as its named placeholder.

const capture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'rainfall-graph-75-20261105T1312Z.json'), 'utf8')
) as { stationId: string; data: Array<{ timestamp: string; rf: number }> }

describe('REPLAY_2_NOVEMBER, from the capture', () => {
  test('is the 60 minutes to the 15:00 MYT reading the 15:05 poll stored (D12)', () => {
    // A JPS value at T covers (T − 5 min, T], so the 60 minutes to 15:00 are the readings 14:05 to 15:00 MYT.
    const hour = capture.data.filter((r) => r.timestamp > '2026-11-02T14:00:00' && r.timestamp <= '2026-11-02T15:00:00')
    expect(hour).toHaveLength(12)
    const total = Math.round(hour.reduce((sum, r) => sum + r.rf, 0) * 10) / 10
    expect(REPLAY_2_NOVEMBER).toEqual({
      station_id: capture.stationId,
      url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
      captured_at: '2026-11-05T13:12:00Z',
      observed_at: new Date('2026-11-02T15:00:00+08:00').toISOString(),
      polled_at: new Date('2026-11-02T15:05:00+08:00').toISOString(),
      rain_60m_mm: total
    })
    expect(total).toBe(39)
  })
})

const SKY_MODES: Array<Mode | null> = ['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', null]
const PREVIEWS = SKY_MODES.flatMap((mode) =>
  (['en', 'ms'] as const).flatMap((language) =>
    (['email', 'ics'] as const).map((channel) => ({ mode, language, channel }))
  )
)
// The replay's own numbers (station, 39.0 mm, 60 min, 15:00 MYT, 5 min old, 2 November 2026), n=0 and 999.
const ALLOWED = new Set(['0232901', '39.0', '60', '15', '00', '5', '2', '2026', '0', '999'])

describe('renderReplayPreview', () => {
  test("the English Commute disruption email reads as DESIGN's template with the replay filled in", () => {
    const r = renderReplayPreview({ mode: 'commute_disruption', language: 'en', channel: 'email' })
    expect(r.subject).toBe('Commute disruption: {window}, {Ddd D Mmm} ({project})')
    expect(r.text).toBe(
      [
        "Replay of JPS gauge 0232901RF, 2 November 2026. n=0: this project has no sent call yet, so only the replay's measured values are filled in.",
        '',
        'Commute disruption for {window}, {Dddd D Mmmm YYYY}.',
        '',
        'Why: {clause}. The gauge at 0232901RF logged 39.0 mm in 60 min to 15:00 MYT, {class}. The gauge was 5 min old when drafted.',
        'Approved by the {role} on duty at {HH:MM} MYT. Details and readings: {permalink}',
        '',
        'Skyclause is not a safety or emergency service. In an emergency, call 999.',
        'Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.',
        'Sources: {source}',
        'Change your notices: {preferences}',
        'Unsubscribe: {unsubscribe}'
      ].join('\n')
    )
  })

  test.each(PREVIEWS)('$mode $language $channel: labelled replay, n=0, no number from anywhere else', (o) => {
    const r = renderReplayPreview(o)
    const all = `${r.subject}\n${r.text}\n${r.html ?? ''}`
    expect(r.text.split('\n')[0]).toMatch(o.language === 'en' ? /^Replay .* n=0/ : /^Ulangan .* n=0/)
    for (const placeholder of ['{window}', '{clause}', '{HH:MM}', '{permalink}', '{source}']) {
      expect(all).toContain(placeholder)
    }
    for (const number of all.replace(/<[^>]*>/g, '').match(/\d+(\.\d+)?/g) ?? []) expect(ALLOWED).toContain(number)
  })
})
