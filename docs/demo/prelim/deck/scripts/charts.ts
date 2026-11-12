// Draws the deck's two data charts from the stored JPS 5-minute series for gauge 0232901RF, and fails unless the
// totals match the figures the deck and the video script print. A reading stamped T covers (T−5 min, T].
// Run from the repo root: bun docs/demo/prelim/deck/scripts/charts.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')
const CAPTURE = join(ROOT, 'pilot/fixtures/rainfall-graph-75-20261105T1312Z.json')

type Reading = { timestamp: string; rf: number }
const series: Reading[] = JSON.parse(readFileSync(CAPTURE, 'utf8')).data
const rf = new Map(series.map((r) => [r.timestamp, r.rf]))
const DAY = '2026-11-02'
const ms = (hhmm: string) => Date.parse(`${DAY}T${hhmm}:00Z`)
const stamp = (t: number) => new Date(t).toISOString().slice(0, 19)
const fiveMin = (t: number) => {
  const value = rf.get(stamp(t))
  if (value === undefined) throw new Error(`No reading at ${stamp(t)}`)
  return value
}
const hour = (t: number) => Array.from({ length: 12 }, (_, k) => fiveMin(t - k * 300_000)).reduce((a, b) => a + b, 0)
const round = (n: number) => Math.round(n * 10) / 10

// The figures the deck and the script print; a mismatch stops the build.
const expected: Record<string, number> = { '14:55': 29.5, '15:00': 39.0, '15:35': 59.5, '16:00': 24.0 }
for (const [hhmm, mm] of Object.entries(expected)) {
  const got = round(hour(ms(hhmm)))
  if (got !== mm) throw new Error(`60-min total at ${hhmm}: expected ${mm}, got ${got}`)
}
let twoHours = 0
for (let t = ms('14:05'); t <= ms('16:00'); t += 300_000) twoHours += fiveMin(t)
if (round(twoHours) !== 63.0) throw new Error(`(14:00, 16:00] total: expected 63.0, got ${round(twoHours)}`)

const C = {
  ground: '#0a0a0a',
  ink: '#efefef',
  soft: '#8c8c8c',
  grid: '#2a292e',
  bar: '#bdbdc0',
  crimson: '#f0566c',
  lebatFill: '#2a2416',
  lebatInk: '#d9a441'
}
const FONT = `font-family="Work Sans, sans-serif"`
const MONO = `font-family="JetBrains Mono, monospace"`
const label = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The window strip: 5-minute bars, the rolling 60-minute total against the Lebat band, the window line. */
function strip(): string {
  const W = 1600,
    H = 620,
    left = 96,
    right = 40
  const from = ms('14:00'),
    to = ms('16:30')
  const x = (t: number) => left + ((t - from) / (to - from)) * (W - left - right)
  // Upper lane: 60-minute total, 0–70 mm.
  const top = 40,
    laneH = 320
  const yTotal = (mm: number) => top + laneH - (mm / 70) * laneH
  // Lower lane: 5-minute rain, 0–15 mm.
  const barTop = top + laneH + 60,
    barH = 140
  const yBar = (mm: number) => barTop + barH - (mm / 15) * barH
  const parts: string[] = []
  parts.push(
    `<rect x="${left}" y="${yTotal(60)}" width="${W - left - right}" height="${yTotal(31) - yTotal(60)}" fill="${C.lebatFill}"/>`,
    `<text x="${left + 12}" y="${yTotal(31) - 12}" fill="${C.lebatInk}" font-size="20" ${FONT}>Lebat · 31–60 mm in an hour (JPS)</text>`
  )
  for (const mm of [0, 20, 40, 60])
    parts.push(
      `<line x1="${left}" x2="${W - right}" y1="${yTotal(mm)}" y2="${yTotal(mm)}" stroke="${C.grid}" stroke-width="1"/>`,
      `<text x="${left - 14}" y="${yTotal(mm) + 6}" text-anchor="end" fill="${C.soft}" font-size="18" ${MONO}>${mm}</text>`
    )
  parts.push(
    `<text x="${left}" y="${top - 12}" fill="${C.soft}" font-size="18" ${FONT}>Rain in the last 60 min, mm</text>`,
    `<text x="${left}" y="${barTop - 14}" fill="${C.soft}" font-size="18" ${FONT}>Rain per 5 min, mm (0–15)</text>`
  )
  const points: string[] = []
  for (let t = from; t <= to; t += 300_000) {
    const total = hour(t)
    points.push(`${x(t).toFixed(1)},${yTotal(total).toFixed(1)}`)
    const v = fiveMin(t)
    const bw = ((W - left - right) / 30) * 0.7
    if (v > 0)
      parts.push(
        `<rect x="${(x(t) - bw).toFixed(1)}" y="${yBar(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(barTop + barH - yBar(v)).toFixed(1)}" fill="${C.bar}"/>`
      )
  }
  parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${C.ink}" stroke-width="3"/>`)
  parts.push(
    `<line x1="${left}" x2="${W - right}" y1="${barTop + barH}" y2="${barTop + barH}" stroke="${C.grid}" stroke-width="1"/>`
  )
  for (let m = 14 * 60; m <= 16 * 60 + 30; m += 30)
    parts.push(
      `<text x="${x(ms(label(m)))}" y="${barTop + barH + 34}" text-anchor="middle" fill="${C.soft}" font-size="18" ${MONO}>${label(m)}</text>`
    )
  // Before, crossing and the poll that flips the verdict.
  const before = ms('14:55'),
    cross = ms('15:00'),
    wave = ms('15:30')
  parts.push(
    `<circle cx="${x(before)}" cy="${yTotal(29.5)}" r="7" fill="${C.ground}" stroke="${C.ink}" stroke-width="3"/>`,
    `<text x="${x(before) + 18}" y="${yTotal(29.5) + 34}" fill="${C.ink}" font-size="22" ${FONT}>14:55 · 29.5 mm · Normal</text>`,
    `<circle cx="${x(cross)}" cy="${yTotal(39)}" r="8" fill="${C.ink}"/>`,
    `<text x="${x(cross) - 16}" y="${yTotal(39) - 18}" text-anchor="end" fill="${C.ink}" font-size="22" font-weight="600" ${FONT}>15:00 · 39.0 mm · Lebat</text>`,
    `<line x1="${x(wave)}" x2="${x(wave)}" y1="${top}" y2="${barTop + barH}" stroke="${C.crimson}" stroke-width="2"/>`,
    `<text x="${x(wave) + 12}" y="${top + 18}" fill="${C.crimson}" font-size="20" ${FONT}>15:30 · 89 sessions end</text>`
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Replay of 2 November 2026: the 60-minute rain total at gauge 0232901RF reaches the Lebat class at 15:00, before 89 sessions end at 15:30.">${parts.join('')}</svg>\n`
}

/** The problem chart: 5-minute rain from 14:00 to 16:00, with the 15:30 release wave. */
function bars(): string {
  const W = 1200,
    H = 480,
    left = 64,
    right = 48,
    top = 30,
    plotH = 360
  const from = ms('14:00'),
    to = ms('16:00')
  const x = (t: number) => left + ((t - from) / (to - from)) * (W - left - right)
  const y = (mm: number) => top + plotH - (mm / 15) * plotH
  const parts: string[] = []
  for (const mm of [0, 5, 10, 15])
    parts.push(
      `<line x1="${left}" x2="${W - right}" y1="${y(mm)}" y2="${y(mm)}" stroke="${C.grid}" stroke-width="1"/>`,
      `<text x="${left - 12}" y="${y(mm) + 6}" text-anchor="end" fill="${C.soft}" font-size="18" ${MONO}>${mm}</text>`
    )
  const bw = ((W - left - right) / 24) * 0.72
  for (let t = from + 300_000; t <= to; t += 300_000) {
    const v = fiveMin(t)
    if (v > 0)
      parts.push(
        `<rect x="${(x(t) - bw).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(top + plotH - y(v)).toFixed(1)}" fill="${C.bar}"/>`
      )
  }
  for (let m = 14 * 60; m <= 16 * 60; m += 30)
    parts.push(
      `<text x="${x(ms(label(m)))}" y="${top + plotH + 32}" text-anchor="middle" fill="${C.soft}" font-size="18" ${MONO}>${label(m)}</text>`
    )
  const wave = ms('15:30')
  parts.push(
    `<line x1="${x(wave)}" x2="${x(wave)}" y1="${top}" y2="${top + plotH}" stroke="${C.crimson}" stroke-width="2"/>`,
    `<text x="${x(wave) + 12}" y="${top + 20}" fill="${C.crimson}" font-size="20" ${FONT}>15:30 release wave</text>`,
    `<text x="${left}" y="${H - 8}" fill="${C.soft}" font-size="16" ${FONT}>Rain per 5 min, mm. JPS gauge 0232901RF, Sg. Kuyoh di LRT Bukit Jalil.</text>`
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Replay of 2 November 2026: 63.0 mm of rain fell between 14:00 and 16:00 at gauge 0232901RF, across the 15:30 release wave.">${parts.join('')}</svg>\n`
}

// Inline each chart between its markers in index.html, so its text uses the deck's web fonts.
const DECK = join(import.meta.dirname, '..', 'skyclause-pitch-deck.html')
let html = readFileSync(DECK, 'utf8')
// The problem chart is required; the crossing strip is inlined only where a slide still holds its markers.
for (const [name, svg, required] of [
  ['bars-2nov', bars(), true],
  ['strip-2nov', strip(), false]
] as const) {
  const marker = new RegExp(`(<!-- chart:${name} -->)[\\s\\S]*?(<!-- /chart:${name} -->)`)
  if (!marker.test(html)) {
    if (required) throw new Error(`the deck has no chart:${name} markers`)
    continue
  }
  html = html.replace(marker, `$1${svg.trim()}$2`)
}
writeFileSync(DECK, html)
console.log('Charts inlined in the deck; totals match: 29.5, 39.0, 59.5, 24.0 mm and 63.0 mm over (14:00, 16:00].')
