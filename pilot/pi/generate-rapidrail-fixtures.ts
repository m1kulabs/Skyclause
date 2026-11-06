// Regenerates the committed Rapid Rail fixtures from downloaded yearly parquets
// (#68): `rapidrail-sp17-daily.json` (every night's SP17 exits) and the parquet
// extract (every SP17-destination row for the sample days). Re-run on a new
// capture with that capture's parquet paths and sample days; the outputs are
// byte-stable for identical inputs (sorted days, sorted origins, one newline).
import { writeFileSync } from 'node:fs'
import { readParquetRecords } from './ridership-run.ts'
import { reduceNightlies, SP17 } from './ridership.ts'

interface ExtractRow {
  origin: string
  destination: string
  date: string
  ridership: number
}

function dayOfRecord(record: Record<string, unknown>): string {
  const date = record.date
  if (date instanceof Date) return date.toISOString().slice(0, 10)
  return String(date).slice(0, 10)
}

function flagValue(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  return index === -1 ? null : (args[index + 1] ?? null)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dailyOut = flagValue(args, '--daily') ?? ''
  const extractOut = flagValue(args, '--extract') ?? ''
  const sampleDays = new Set((flagValue(args, '--sample-days') ?? '').split(',').filter(Boolean))
  const parquets = args.filter((arg) => arg.endsWith('.parquet'))
  if (!dailyOut || parquets.length === 0) {
    console.error(
      'usage: bun pilot/pi/generate-rapidrail-fixtures.ts --daily <out> [--extract <out> --sample-days <csv>] <parquet...>'
    )
    process.exit(1)
  }
  const extract: ExtractRow[] = []
  const totals = new Map<string, number>()
  for (const path of parquets) {
    const buffer = (await Bun.file(path).arrayBuffer()) as ArrayBuffer
    const read = await readParquetRecords(buffer)
    if ('schemaError' in read) throw new Error(`${path}: ${read.schemaError}`)
    // The reducer is the source of truth for the daily totals; the generator
    // only merges the per-file nights and projects the extract rows.
    const reduced = reduceNightlies(read.records)
    if ('schemaError' in reduced) throw new Error(`${path}: ${reduced.schemaError}`)
    for (const night of reduced.nights) totals.set(night.date, night.exits)
    for (const record of read.records) {
      if (record.destination !== SP17) continue
      const day = dayOfRecord(record)
      if (sampleDays.has(day)) {
        extract.push({
          origin: record.origin as string,
          destination: record.destination as string,
          date: day,
          ridership: Number(record.ridership)
        })
      }
    }
  }
  const nights = [...totals].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, exits]) => ({ date, exits }))
  writeFileSync(
    dailyOut,
    `${JSON.stringify(Object.fromEntries(nights.map((night) => [night.date, night.exits])), null, 1)}\n`
  )
  if (extractOut) {
    extract.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.origin < b.origin ? -1 : 1))
    writeFileSync(extractOut, `${JSON.stringify(extract)}\n`)
  }
  const days = nights.map((night) => night.date)
  console.log(`${nights.length} nights from ${days[0]} to ${days[days.length - 1]}; extract rows: ${extract.length}`)
}
