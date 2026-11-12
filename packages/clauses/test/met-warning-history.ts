import { readFileSync } from 'node:fs'
import type { ReadingHistory } from '../src/types'

// The archived provider warning is the input; mutations stay in each test's clone.
type ArchivedWarning = {
  warning_issue: { issued: string; title_en: string; title_bm: string }
  valid_from: string | null
  valid_to: string | null
  text_en: string
  [key: string]: unknown
}

export function metWarningHistory(): ReadingHistory {
  const raw: ArchivedWarning[] = JSON.parse(
    readFileSync(new URL('../../sources/test/fixtures/weather-warning-20261105T1313Z.json', import.meta.url), 'utf8')
  )
  return {
    warningAreaTerms: ['Kedah'],
    sources: [
      {
        id: 'met',
        kind: 'met_warning',
        cadenceS: 600,
        staleAfterS: 1200,
        freshness: 'polled',
        probation: false,
        meta: {}
      }
    ],
    polls: [
      {
        id: 'poll',
        sourceId: 'met',
        startedAt: '2026-11-05T13:13:00Z',
        receivedAt: '2026-11-05T13:13:01Z',
        outcome: 'ok',
        httpStatus: 200
      }
    ],
    readings: raw.map((row, i) => ({
      id: `warning-${i}`,
      sourceId: 'met',
      metric: 'warning',
      observedAt: new Date(`${row.warning_issue.issued}+08:00`).toISOString(),
      receivedAt: '2026-11-05T13:13:01Z',
      value: null,
      valueText: row.text_en,
      itemKey: `${row.warning_issue.title_en}|${row.valid_from}`,
      revision: 1,
      valueJson: {
        ...row,
        valid_from_utc: row.valid_from === null ? null : new Date(`${row.valid_from}+08:00`).toISOString(),
        valid_to_utc: row.valid_to === null ? null : new Date(`${row.valid_to}+08:00`).toISOString(),
        excluded: row.warning_issue.title_en === 'No Advisory' || row.warning_issue.title_en.includes('Rough Seas')
      }
    }))
  }
}
