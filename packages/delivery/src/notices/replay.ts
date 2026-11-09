import type { Mode } from '@skyclause/contracts'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { age, label, layout, modeWord, say, type NoticeLanguage, type Rendered } from './render'

// #152 NTC-7 and DESIGN "Known gaps": with no sent call yet, a Sky preview fills only the measured parts of the
// labelled 2 November 2026 replay (D9, D12) and leaves every other field as its named placeholder.

/** JPS gauge 0232901RF's 60 minutes to the 15:00 MYT reading the 15:05 poll stored, from the 5 November capture. */
export const REPLAY_2_NOVEMBER = {
  station_id: '0232901RF',
  url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
  captured_at: '2026-11-05T13:12:00Z',
  observed_at: '2026-11-02T07:00:00.000Z',
  polled_at: '2026-11-02T07:05:00.000Z',
  rain_60m_mm: 39
} as const

export function renderReplayPreview(o: {
  mode: Mode | null
  language: NoticeLanguage
  channel: 'email' | 'ics'
}): Rendered {
  const { language } = o
  const r = REPLAY_2_NOVEMBER
  const gauge = label('inputs', 'rain', language)
  const ageNow = age((Date.parse(r.polled_at) - Date.parse(r.observed_at)) / 1000, language)
  return layout(
    {
      label: say('replay.label', { station: r.station_id, date: formatDate(r.observed_at, language) }, language),
      mode: modeWord({ mode: o.mode, watch: false }, language),
      window: '{window}',
      dateShort: '{Ddd D Mmm}',
      dateLong: '{Dddd D Mmmm YYYY}',
      project: '{project}',
      reason: say(
        'replay.why',
        {
          clause: '{clause}',
          input: gauge,
          station: r.station_id,
          value: r.rain_60m_mm.toFixed(1),
          unit: 'mm',
          minutes: '60',
          time: formatTime(r.observed_at, language),
          class: '{class}',
          age: ageNow
        },
        language
      ),
      role: '{role}',
      time: '{HH:MM} MYT',
      teaching: o.mode === 'hybrid_recommended',
      sources: '{source}',
      clauses: [
        say(
          'ics.clause',
          { clause: '{clause}', inputs: say('input_age', { input: gauge, age: ageNow }, language) },
          language
        )
      ],
      links:
        o.channel === 'email'
          ? { permalink: '{permalink}', preferences: '{preferences}', unsubscribe: '{unsubscribe}' }
          : { permalink: '{permalink}' }
    },
    language,
    o.channel
  )
}
