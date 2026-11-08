import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type SourceReading = { timestamp: string; rf: number | string | null }
type ShotsContract = {
  replay: {
    gauge: string
    capture: string
    expected_totals_60min_mm: Record<string, number>
    expected_total_14_to_16_mm: number
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sourcePath = resolve(root, 'pilot/fixtures/rainfall-graph-75-20261105T1312Z.json')
const shotsPath = resolve(root, 'docs/video/shots.json')
const outputPath = resolve(root, 'docs/video/src/data/replay-2nov.json')
const source = JSON.parse(await readFile(sourcePath, 'utf8')) as { data: SourceReading[] }
const contract = JSON.parse(await readFile(shotsPath, 'utf8')) as ShotsContract
const readings = source.data
  .map((reading) => {
    if (reading.rf === null || reading.rf === '') throw new Error(`Missing JPS rain value at ${reading.timestamp}`)
    const rain = Number(reading.rf)
    if (!Number.isFinite(rain)) throw new Error(`Invalid JPS rain value at ${reading.timestamp}`)
    return { timestamp: reading.timestamp, rain_mm: rain }
  })
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

const parseMyt = (timestamp: string) => Date.parse(`${timestamp}+08:00`)
const rangeStart = parseMyt('2026-11-02T13:00:00')
const rangeEnd = parseMyt('2026-11-02T17:00:00')
const selected = readings.filter((reading) => {
  const time = parseMyt(reading.timestamp)
  return time >= rangeStart && time <= rangeEnd
})
if (selected.length !== 49)
  throw new Error(`Expected 49 five-minute readings from 13:00 to 17:00 MYT; found ${selected.length}`)
for (let i = 1; i < selected.length; i++) {
  const difference = parseMyt(selected[i]!.timestamp) - parseMyt(selected[i - 1]!.timestamp)
  if (difference !== 5 * 60_000) throw new Error(`JPS series has a gap before ${selected[i]!.timestamp}`)
}

const rolling = selected.map((reading) => {
  const end = parseMyt(reading.timestamp)
  const start = end - 60 * 60_000
  const window = readings.filter((candidate) => {
    const time = parseMyt(candidate.timestamp)
    return time > start && time <= end
  })
  if (window.length !== 12)
    throw new Error(`Expected 12 readings in the rolling hour to ${reading.timestamp}; found ${window.length}`)
  return {
    ...reading,
    rolling_60min_mm: Number(window.reduce((total, item) => total + item.rain_mm, 0).toFixed(1))
  }
})

const clock = (timestamp: string) => timestamp.slice(11, 16)
for (const [time, expected] of Object.entries(contract.replay.expected_totals_60min_mm)) {
  const actual = rolling.find((reading) => clock(reading.timestamp) === time)?.rolling_60min_mm
  if (actual !== expected)
    throw new Error(`${time} rolling 60-minute total is ${actual ?? 'missing'} mm; expected ${expected} mm`)
}

const intervalStart = parseMyt('2026-11-02T14:00:00')
const intervalEnd = parseMyt('2026-11-02T16:00:00')
const total14To16 = Number(
  readings
    .filter((reading) => {
      const time = parseMyt(reading.timestamp)
      return time > intervalStart && time <= intervalEnd
    })
    .reduce((total, reading) => total + reading.rain_mm, 0)
    .toFixed(1)
)
if (total14To16 !== contract.replay.expected_total_14_to_16_mm || total14To16 !== 63.0)
  throw new Error(
    `(14:00, 16:00] totals ${total14To16} mm; expected ${contract.replay.expected_total_14_to_16_mm} mm and 63.0 mm`
  )

const output = {
  gauge: contract.replay.gauge,
  date: '2026-11-02',
  timezone: 'Asia/Kuala_Lumpur',
  capture: contract.replay.capture,
  reading_semantics: 'A reading stamped T covers (T−5 min, T].',
  window: { start: '13:00', end: '17:00' },
  total_14_to_16_mm: total14To16,
  readings: rolling
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
console.log(`60-minute totals: ${JSON.stringify(contract.replay.expected_totals_60min_mm)}`)
console.log(`(14:00, 16:00] total: ${total14To16.toFixed(1)} mm`)
