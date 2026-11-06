import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StripInput } from '../../src/strip'

interface CaptureRow {
  timestamp: string
  rf: number
  dailyrf: number
}

interface Capture {
  stationId: string
  data: CaptureRow[]
}

function mytToUtc(myt: string): string {
  return new Date(`${myt}+08:00`).toISOString().replace('.000Z', 'Z')
}

export function loadCapture(): Capture {
  const here = dirname(fileURLToPath(import.meta.url))
  const raw = readFileSync(join(here, 'rainfall-graph-75-20261105T1312Z.json'), 'utf8')
  return JSON.parse(raw) as Capture
}

/** Committed generator: 5-minute JPS values into strip data with 60-minute rolling totals (D12). */
export function stripFromCapture(options?: {
  from?: string
  to?: string
  now?: string
  removeAt?: string
  errorSpan?: { from: string; to: string }
  replay?: boolean
}): StripInput {
  const capture = loadCapture()
  const from = options?.from ?? '2026-11-02T14:00:00+08:00'
  const to = options?.to ?? '2026-11-02T16:00:00+08:00'
  const now = options?.now ?? '2026-11-02T16:05:00+08:00'

  const rows = capture.data
    .filter((row) => {
      const at = new Date(`${row.timestamp}+08:00`).getTime()
      return at >= new Date(from).getTime() && at <= new Date(to).getTime()
    })
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))

  const rain5 = rows.map((row) => {
    const at = mytToUtc(row.timestamp)
    if (options?.removeAt && at === options.removeAt) {
      return { at, value: null, state: 'missed' as const }
    }
    if (options?.errorSpan && at >= options.errorSpan.from && at <= options.errorSpan.to) {
      return { at, value: null, state: 'error' as const }
    }
    return { at, value: row.rf, state: 'received' as const }
  })

  const values = rows.map((row) => row.rf)
  const rain60 = rows.map((row, index) => {
    const at = mytToUtc(row.timestamp)
    if (options?.removeAt && at === options.removeAt) return { at, value: null }
    if (options?.errorSpan && at >= options.errorSpan.from && at <= options.errorSpan.to) {
      return { at, value: null }
    }
    const start = Math.max(0, index - 11)
    const total = values.slice(start, index + 1).reduce((sum, v) => sum + v, 0)
    return { at, value: Math.round(total * 10) / 10 }
  })

  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    now: new Date(now).toISOString(),
    window: {
      from: new Date('2026-11-02T15:30:00+08:00').toISOString(),
      to: new Date('2026-11-02T17:30:00+08:00').toISOString()
    },
    rain5,
    rain60,
    warnings: [],
    crowdPeriods: [],
    ages: [{ name: 'gauge', observedAt: new Date('2026-11-02T15:00:00+08:00').toISOString() }],
    replay:
      options?.replay === false
        ? null
        : {
            source: 'infobanjirjpskl.water.gov.my station 75',
            capturedAt: '2026-11-05T13:12:00Z'
          },
    errorSpans: options?.errorSpan
      ? [{ from: options.errorSpan.from, to: options.errorSpan.to }]
      : rain5.some((p) => p.state === 'error')
        ? [{ from: rain5.find((p) => p.state === 'error')!.at, to: rain5.find((p) => p.state === 'error')!.at }]
        : []
  }
}
