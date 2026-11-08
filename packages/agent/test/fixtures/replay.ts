// Committed generator (spec §7): the 2 November 2026 labelled replay as an `AgentInput`, from the JPS capture byte copy.
// Values come from the capture; IDs are test identifiers, and the sheet holds the published Sky default's window clauses.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentInput, ProposedBundle } from '../../src/schema'

const here = dirname(fileURLToPath(import.meta.url))

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}
interface MetWarning {
  warning_issue: { issued: string; title_bm: string; title_en: string }
  text_en: string
  text_bm: string
}

export const ids = {
  window: '019a4300-5a80-7000-8000-000000000001',
  source: '019a4300-5a80-7000-8000-000000000002',
  candidates: ['019a4300-5a80-7000-8000-000000000003', '019a4300-5a80-7000-8000-000000000004'],
  night: '019a4300-5a80-7000-8000-000000000005'
}
export const origins = ['https://skyclause.m1ku.tech', 'https://app.skyclause.m1ku.tech']
export const sourceUrl = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'

const utc = (myt: string) => new Date(`${myt}+08:00`).toISOString().replace('.000Z', 'Z')

export function jpsCapture(): JpsCapture {
  return JSON.parse(readFileSync(join(here, 'rainfall-graph-75-20261105T1312Z.json'), 'utf8')) as JpsCapture
}

/** The Thunderstorms Warning issued 21:05 MYT on 5 November 2026, verbatim (LOC-3). */
export function thunderstormWarning(): string {
  const records = JSON.parse(readFileSync(join(here, 'weather-warning-20261105T1313Z.json'), 'utf8')) as MetWarning[]
  return records.find((record) => record.warning_issue.title_en === 'Thunderstorms Warning')!.text_en
}

/** The window rain and warning clauses of the published Sky default sheet (`packages/clauses/defaults/sky.json`). */
const skySheet: AgentInput['sheet'] = {
  pack: 'sky',
  clauses: [
    {
      key: 'storm_watch',
      when: 'w.met_warning_in_force',
      wording: { en: 'A warning naming W.P. Kuala Lumpur is valid across the window' }
    },
    {
      key: 'storm_confirmed',
      when: 'w.rain_max_60m_mm >= 31.0',
      wording: { en: 'Storm confirmed at the JPS gauge (Lebat class)' }
    },
    {
      key: 'flash_flood_risk',
      when: 'w.rain_max_4h_mm > 60',
      wording: { en: 'Flash-flood risk: {w.rain_max_4h_mm.value} {w.rain_max_4h_mm.unit}' }
    }
  ]
}

/**
 * The 15:05 MYT poll on 2 November 2026: it stored the 15:00 reading, whose 60-minute total over (14:00, 15:00] is
 * 39.0 mm (D12), 5 minutes old, ahead of the 15:30 release wave (a zero-length commute wave).
 */
export function replayInput(): AgentInput {
  const capture = jpsCapture()
  const tEval = utc('2026-11-02T15:05:00')
  const observedAt = utc('2026-11-02T15:00:00')
  const hour = capture.data.filter(
    (row) => row.timestamp > '2026-11-02T14:00:00' && row.timestamp <= '2026-11-02T15:00:00'
  )
  const total = hour.reduce((sum, row) => sum + row.rf, 0)
  const fresh = (name: string) => ({ name, sourceId: ids.source, state: 'fresh' as const, since: observedAt })
  return {
    pack: 'sky',
    sheet: structuredClone(skySheet),
    snapshot: {
      projectId: '019a4300-5a80-7000-8000-000000000006',
      pack: 'sky',
      tEval,
      inputs: [fresh('site.rain_60m_mm'), fresh('w.rain_max_60m_mm')],
      site: {
        'site.rain_60m_mm': {
          name: 'site.rain_60m_mm',
          value: total,
          unit: 'mm',
          state: 'fresh',
          since: observedAt,
          ageS: 300,
          sourceIds: [ids.source],
          readingIds: [],
          observedAt
        }
      },
      series: {},
      nights: [],
      registryHash: 'registry',
      hash: 'snapshot'
    },
    met_warnings: [],
    windows: [{ id: ids.window, starts_at: utc('2026-11-02T15:30:00'), ends_at: utc('2026-11-02T15:30:00') }],
    candidates: {
      [ids.window]: [
        { id: ids.candidates[0]!, role: 'student', language: 'en' },
        { id: ids.candidates[1]!, role: 'lecturer', language: 'ms' }
      ]
    },
    yesterday_grades: [],
    quotable: [],
    malay_reader: false,
    source_urls: [sourceUrl],
    origins
  }
}

/** DESIGN "Voice and content": the 2 November replay's call wording. */
export const designBody =
  'Commute disruption for the 15:30 release wave, Monday 2 November 2026. Why: Storm confirmed, gauge 39.0 mm in 60 min to 15:00 (Lebat), 5 min old at the 15:05 poll.'

export function replayBundle(body = designBody): ProposedBundle {
  return {
    pack: 'sky',
    calls: [
      {
        window_id: ids.window,
        mode: 'commute_disruption',
        watch: false,
        no_call: null,
        fired: [{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }],
        recommendations: [],
        recipients: [...ids.candidates],
        notices: [{ language: 'en', subject: 'Commute disruption for the 15:30 release wave', body }],
        reason: 'Storm confirmed: the 60-minute total reached the Lebat class at the 15:00 reading.'
      }
    ],
    items: []
  }
}
