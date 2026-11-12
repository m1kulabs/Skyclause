import type { Instant, Mode } from '@skyclause/contracts'
import { t } from '@skyclause/i18n/brand'
import { formatDate, formatTime } from '@skyclause/i18n/format'
import { brandStates, glyphPaths, modeColours, toneColours, type GlyphName, type ModeTone } from './glyphs'

export type StripLocale = 'en' | 'ms'
export type StripPointState = 'received' | 'missed' | 'error'

export interface StripReading {
  at: Instant
  value: number | null
  state: StripPointState
}

export interface StripSixty {
  at: Instant
  value: number | null
}

export interface StripWarningSpan {
  id: string
  from: Instant
  to: Instant
  text: string
}

export interface StripCrowdPeriod {
  id: string
  arrivalStart: Instant
  arrivalEnd: Instant | null
  exitStart: Instant | null
  exitEnd: Instant | null
  label?: string
}

export interface StripAge {
  name: string
  observedAt: Instant | null
}

export interface StripReplay {
  source: string
  capturedAt: Instant
}

/** One declared window on the day strip and the state of its call. */
export interface StripWindow {
  id: string
  from: Instant
  to: Instant
  /** The call's mode, Storm watch or No call; null while the window has no call yet. */
  state: Mode | 'storm_watch' | 'no_call' | null
  /** A drafted call not yet approved: its capsule is edged in the mode's colour instead of filled. */
  draft?: boolean
  /** The window's own name, for its label. */
  title?: string
}

export interface StripInput {
  from: Instant
  to: Instant
  now: Instant
  /** A single window drawn on the strip (its call unknown here). Prefer `windows`, which carries each call's state. */
  window?: { from: Instant; to: Instant } | null
  /** Every window of the span with its call's state, drawn as capsules on the strip. */
  windows?: readonly StripWindow[]
  rain5: readonly StripReading[]
  rain60: readonly StripSixty[]
  warnings?: readonly StripWarningSpan[]
  crowdPeriods?: readonly StripCrowdPeriod[]
  ages?: readonly StripAge[]
  replay?: StripReplay | null
  errorSpans?: readonly { from: Instant; to: Instant }[]
  locale?: StripLocale
}

export interface StripTick {
  value: number
  y: number
  label: string
}

export interface StripLane {
  key: 'rain5' | 'rain60' | 'warnings' | 'crowd' | 'ages'
  yMax: number
  ticks: StripTick[]
  empty: boolean
}

export interface StripCrossing {
  at: Instant
  value: number
  x: number
  y: number
  label: string
}

/** A window's capsule: its place on the strip, the tone that fills it, its glyph and its word. */
export interface StripWindowMark {
  id: string
  from: Instant
  to: Instant
  x1: number
  x2: number
  state: StripWindow['state']
  /** The capsule's tone; 'pending' is a window with no call yet (an edge, no fill). */
  tone: ModeTone | 'pending'
  glyph: GlyphName | null
  /** The state's word in the strip's locale; null while the window has no call. */
  word: string | null
  draft: boolean
  title: string | null
}

export interface StripLayout {
  width: number
  height: number
  /** The plot's left and right edges in the same units as every x, for laying HTML over the strip. */
  plotLeft: number
  plotRight: number
  from: Instant
  to: Instant
  now: Instant
  xTicks: Array<{ at: Instant; x: number; label: string }>
  lanes: StripLane[]
  rain5Path: string
  rain5Gaps: number
  rain60Path: string
  crossings: StripCrossing[]
  errorMarks: Array<{ from: Instant; to: Instant; x1: number; x2: number }>
  warningMarks: Array<{ id: string; x1: number; x2: number; text: string }>
  crowdMarks: Array<{ id: string; ax1: number; ax2: number; ex1: number | null; ex2: number | null }>
  isReplay: boolean
  replayBadge: string | null
  windowX1: number | null
  windowX2: number | null
  /** The window capsules, left to right, and the lane they sit in (null when there are none). */
  windowMarks: StripWindowMark[]
  windowsY: number | null
  nowX: number
  /** Whether now falls inside the strip's span (the now line is drawn only then). */
  nowInSpan: boolean
  lebatY: number | null
}

const WIDTH = 640
const GUTTER = 48
const RIGHT = 16
const HEADER = 28
const X_AXIS = 24
const RAIN5_H = 84
const RAIN60_H = 104
const WARN_H = 26
const CROWD_H = 34
const AGES_H = 22
const LEBAT_MM = 31
const WINDOWS_H = 24

function ms(at: string): number {
  return new Date(at).getTime()
}

function niceTop(max: number, candidates: readonly number[]): number {
  for (const top of candidates) {
    if (top > max) return top
  }
  const last = candidates[candidates.length - 1]!
  const step = last - (candidates[candidates.length - 2] ?? 0)
  let top = last
  while (top <= max) top += step
  return top
}

function laneTicks(top: number, divisions: number, yFor: (v: number) => number): StripTick[] {
  const ticks: StripTick[] = []
  for (let i = 0; i <= divisions; i++) {
    const value = (top / divisions) * i
    ticks.push({ value, y: yFor(value), label: String(Math.round(value)) })
  }
  return ticks
}

function formatTick(at: Instant, locale: StripLocale): string {
  return formatTime(at, locale)
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function layoutStrip(input: StripInput): StripLayout {
  const locale = input.locale ?? 'en'
  const fromMs = ms(input.from)
  const toMs = ms(input.to)
  const span = Math.max(1, toMs - fromMs)
  const plotW = WIDTH - GUTTER - RIGHT
  const xFor = (at: Instant): number => GUTTER + ((ms(at) - fromMs) / span) * plotW

  const rain5 = [...input.rain5].sort((a, b) => ms(a.at) - ms(b.at))
  const rain60 = [...input.rain60].sort((a, b) => ms(a.at) - ms(b.at))

  const rain5Values = rain5.filter((p) => p.value !== null && p.state === 'received').map((p) => p.value as number)
  const rain5Max = rain5Values.length ? Math.max(...rain5Values) : 0
  const rain60Values = rain60.filter((p) => p.value !== null).map((p) => p.value as number)
  const rain60Max = rain60Values.length ? Math.max(...rain60Values) : 0

  const lanes: StripLane[] = []
  let yCursor = HEADER

  // Windows first: every declared window of the span as a capsule, then the readings under them.
  const windowInputs: StripWindow[] = input.windows
    ? [...input.windows]
    : input.window
      ? [{ id: 'window', from: input.window.from, to: input.window.to, state: null }]
      : []
  const clampX = (x: number) => Math.min(WIDTH - RIGHT, Math.max(GUTTER, x))
  const windowMarks: StripWindowMark[] = windowInputs
    .filter((w) => ms(w.to) > fromMs && ms(w.from) < toMs)
    .sort((a, b) => ms(a.from) - ms(b.from))
    .map((w) => {
      const mapping = w.state ? brandStates[w.state] : null
      return {
        id: w.id,
        from: w.from,
        to: w.to,
        x1: clampX(xFor(w.from)),
        x2: clampX(xFor(w.to)),
        state: w.state,
        tone: mapping ? mapping.tone : 'pending',
        glyph: mapping ? mapping.glyph : null,
        word: mapping ? t(mapping.word, {}, locale) : null,
        draft: Boolean(w.draft),
        title: w.title ?? null
      }
    })
  const windowsY = windowMarks.length ? yCursor : null
  if (windowMarks.length) yCursor += WINDOWS_H + 8

  const rain5Top = niceTop(rain5Max, [5, 10, 20, 40])
  const rain5Offset = yCursor
  const rain5Y = (v: number): number => rain5Offset + RAIN5_H - (v / rain5Top) * RAIN5_H
  const rain5Lane: StripLane = {
    key: 'rain5',
    yMax: rain5Top,
    ticks: laneTicks(rain5Top, 2, rain5Y),
    empty: rain5.length === 0
  }
  if (!rain5Lane.empty) {
    lanes.push(rain5Lane)
    yCursor += RAIN5_H + 8
  }

  const rain60Top = niceTop(Math.max(rain60Max, LEBAT_MM), [20, 40, 60, 80, 100])
  const rain60Offset = yCursor
  const rain60Y = (v: number): number => rain60Offset + RAIN60_H - (v / rain60Top) * RAIN60_H
  const rain60Lane: StripLane = {
    key: 'rain60',
    yMax: rain60Top,
    ticks: laneTicks(rain60Top, rain60Top <= 20 ? 2 : 3, rain60Y),
    empty: rain60.length === 0
  }
  if (!rain60Lane.empty) {
    lanes.push(rain60Lane)
    yCursor += RAIN60_H + 8
  }

  const warnings = [...(input.warnings ?? [])].sort((a, b) => ms(a.from) - ms(b.from))
  if (warnings.length) {
    lanes.push({ key: 'warnings', yMax: 1, ticks: [], empty: false })
    yCursor += WARN_H + 8
  }

  const crowd = [...(input.crowdPeriods ?? [])].sort((a, b) => ms(a.arrivalStart) - ms(b.arrivalStart))
  if (crowd.length) {
    lanes.push({ key: 'crowd', yMax: 1, ticks: [], empty: false })
    yCursor += CROWD_H + 8
  }

  const ages = [...(input.ages ?? [])]
  if (ages.length) {
    lanes.push({ key: 'ages', yMax: 1, ticks: [], empty: false })
    yCursor += AGES_H + 8
  }

  const height = yCursor + X_AXIS + 8

  const tickCount = 6
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const atMs = fromMs + (span * i) / (tickCount - 1)
    const at = new Date(atMs).toISOString()
    return { at, x: GUTTER + (plotW * i) / (tickCount - 1), label: formatTick(at, locale) }
  })

  let rain5Path = ''
  let rain5Gaps = 0
  let pen = false
  for (const p of rain5) {
    if (p.value === null || p.state !== 'received') {
      if (pen) rain5Gaps += 1
      pen = false
      continue
    }
    const x = xFor(p.at)
    const y = rain5Y(p.value)
    rain5Path += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    pen = true
  }

  let rain60Path = ''
  let pen60 = false
  for (const p of rain60) {
    if (p.value === null) {
      pen60 = false
      continue
    }
    const x = xFor(p.at)
    const y = rain60Y(p.value)
    rain60Path += `${pen60 ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    pen60 = true
  }

  const crossings: StripCrossing[] = []
  let wasBelow = true
  for (const p of rain60) {
    if (p.value === null) continue
    if (p.value >= LEBAT_MM && wasBelow) {
      const timeLabel = formatTick(p.at, locale)
      crossings.push({
        at: p.at,
        value: p.value,
        x: xFor(p.at),
        y: rain60Y(p.value),
        label: `Lebat at ${timeLabel}`
      })
      wasBelow = false
    } else if ((p.value ?? 0) < LEBAT_MM) {
      wasBelow = true
    }
  }

  const errorMarks = [...(input.errorSpans ?? [])].map((s) => ({ ...s, x1: xFor(s.from), x2: xFor(s.to) }))
  const warningMarks = warnings.map((w) => ({ id: w.id, x1: xFor(w.from), x2: xFor(w.to), text: w.text }))
  const crowdMarks = crowd.map((c) => ({
    id: c.id,
    ax1: xFor(c.arrivalStart),
    ax2: xFor(c.arrivalEnd ?? c.arrivalStart),
    ex1: c.exitStart ? xFor(c.exitStart) : null,
    ex2: c.exitEnd ? xFor(c.exitEnd) : c.exitStart ? xFor(c.exitStart) : null
  }))

  const isReplay = input.replay !== null && input.replay !== undefined
  const replayBadge = isReplay
    ? `Replay · ${input.replay!.source} · ${formatDate(input.replay!.capturedAt, locale)}`
    : null

  const windowX1 = input.window ? xFor(input.window.from) : null
  const windowX2 = input.window ? xFor(input.window.to) : null
  const nowInSpan = ms(input.now) >= fromMs && ms(input.now) <= toMs
  const nowX = clampX(xFor(input.now))
  const lebatY = rain60Lane.empty ? null : rain60Y(Math.min(LEBAT_MM, rain60Top))

  return {
    width: WIDTH,
    height,
    plotLeft: GUTTER,
    plotRight: WIDTH - RIGHT,
    from: input.from,
    to: input.to,
    now: input.now,
    xTicks,
    lanes,
    rain5Path,
    rain5Gaps,
    rain60Path,
    crossings,
    errorMarks,
    warningMarks,
    crowdMarks,
    isReplay,
    replayBadge,
    windowX1,
    windowX2,
    windowMarks,
    windowsY,
    nowX,
    nowInSpan,
    lebatY
  }
}

export interface StripSvgOptions {
  locale?: StripLocale
  lebatLabel?: string
  replayPrefix?: string
  /** Draw the window capsules in the SVG (default). A page that sets them as HTML above the SVG passes false. */
  windowLane?: boolean
}

// The capsule's Dusk colours as attributes, for SVG standing alone (an Open Graph card, a file). On a page, globals.css
// repaints every [data-tone] shape from the theme's --mode-* tokens.
function capsuleSvg(mark: StripWindowMark, y: number): string {
  const x = mark.x1
  const width = Math.max(WINDOWS_H, mark.x2 - mark.x1)
  const left = Math.min(x, WIDTH - RIGHT - width)
  const r = WINDOWS_H / 2
  const tone = mark.tone === 'pending' ? 'no-call' : mark.tone
  const { fill, edge, ink } = toneColours(tone, modeColours.dark)
  const dusk = modeColours.dark
  const hollow = mark.tone === 'pending' || mark.draft || fill === null
  const stroke = mark.draft && fill ? fill : (edge ?? dusk['ink-muted'])
  const dash =
    mark.tone === 'no-call' ? ' stroke-dasharray="4 3"' : mark.tone === 'pending' ? ' stroke-dasharray="1 3"' : ''
  const label = mark.word ? `${mark.word}${mark.title ? ` · ${mark.title}` : ''}` : (mark.title ?? '')
  const parts = [
    `<g data-window="${escapeXml(mark.id)}"${mark.state ? ` data-state="${mark.state}"` : ''}${mark.draft ? ' data-draft="true"' : ''}>`,
    label ? `<title>${escapeXml(label)}</title>` : '',
    hollow
      ? `<rect x="${(left + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${(width - 2).toFixed(1)}" height="${WINDOWS_H - 2}" rx="${r - 1}" fill="none" stroke="${stroke}" stroke-width="2"${dash} data-tone="${mark.draft ? tone : tone}" data-stroke="true"/>`
      : `<rect x="${left.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${WINDOWS_H}" rx="${r}" fill="${fill}" data-tone="${tone}" data-fill="true"/>`
  ]
  const textInk = hollow ? dusk.ink : ink
  const inkHook = hollow ? '' : ` data-tone="${tone}" data-ink="true"`
  if (mark.glyph && width >= 20) {
    const gx = left + (width >= 44 ? 8 : (width - 12) / 2)
    parts.push(
      `<g transform="translate(${gx.toFixed(1)} ${y + 6})" fill="none" stroke="${textInk}" stroke-width="1.5" color="${textInk}"${inkHook}>${glyphPaths[mark.glyph]}</g>`
    )
  }
  // The word goes inside only when it fits; otherwise the capsule keeps its glyph and the title carries the word.
  if (mark.word && width >= 12 + mark.word.length * 6.6 + 30) {
    parts.push(
      `<text x="${(left + 26).toFixed(1)}" y="${y + 16}" font-size="12" font-weight="500" fill="${textInk}"${inkHook}>${escapeXml(mark.word)}</text>`
    )
  }
  parts.push('</g>')
  return parts.join('')
}

export function stripSvg(layout: StripLayout, options: StripSvgOptions = {}): string {
  const locale = options.locale ?? 'en'
  const lebatLabel = options.lebatLabel ?? `Lebat ${31} mm`
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" font-variant-numeric="tabular-nums">`
  )

  const dateLabel = escapeXml(formatDate(layout.from, locale))
  parts.push(`<text x="48" y="16" font-size="12" fill="currentColor">${dateLabel} · MYT</text>`)
  if (layout.isReplay && layout.replayBadge) {
    parts.push(
      `<text x="${layout.width - 16}" y="16" font-size="12" text-anchor="end" fill="currentColor" data-replay="true">${escapeXml(layout.replayBadge)}</text>`
    )
  }

  for (const lane of layout.lanes) {
    for (const tick of lane.ticks) {
      parts.push(
        `<text x="44" y="${tick.y.toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor">${escapeXml(tick.label)}</text>`
      )
    }
  }

  layout.xTicks.forEach((tick, index) => {
    // The end ticks anchor inward so their labels stay inside the strip.
    const anchor = index === 0 ? 'start' : index === layout.xTicks.length - 1 ? 'end' : 'middle'
    parts.push(
      `<text x="${tick.x.toFixed(1)}" y="${(layout.height - 8).toFixed(1)}" font-size="10" text-anchor="${anchor}" fill="currentColor">${escapeXml(tick.label)}</text>`
    )
  })

  // The window's span, as a tone band behind the readings (no line, no hue).
  if (layout.windowX1 !== null && layout.windowX2 !== null) {
    parts.push(
      `<rect x="${layout.windowX1.toFixed(1)}" y="${HEADER}" width="${Math.max(1, layout.windowX2 - layout.windowX1).toFixed(1)}" height="${(layout.height - HEADER - X_AXIS).toFixed(1)}" fill="currentColor" opacity="0.08" data-window-span="true"/>`
    )
  }

  // Readings in ink: the 60-minute total is the emphasised series, the 5-minute reading the quiet one.
  if (layout.lanes.some((l) => l.key === 'rain5' && !l.empty) && layout.rain5Path) {
    const dash = layout.isReplay ? ' stroke-dasharray="4 2"' : ''
    parts.push(
      `<path d="${layout.rain5Path}" fill="none" stroke="currentColor" stroke-width="2" opacity="0.6"${dash} stroke-linecap="round" stroke-linejoin="round"/>`
    )
  }

  if (layout.lanes.some((l) => l.key === 'rain60' && !l.empty)) {
    if (layout.lebatY !== null) {
      parts.push(
        `<line x1="48" y1="${layout.lebatY.toFixed(1)}" x2="${layout.width - 16}" y2="${layout.lebatY.toFixed(1)}" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>`
      )
      parts.push(
        `<text x="${layout.width - 16}" y="${(layout.lebatY - 4).toFixed(1)}" font-size="10" text-anchor="end" fill="currentColor">${escapeXml(lebatLabel)}</text>`
      )
    }
    if (layout.rain60Path) {
      const dash = layout.isReplay ? ' stroke-dasharray="4 2"' : ''
      parts.push(
        `<path d="${layout.rain60Path}" fill="none" stroke="currentColor" stroke-width="2.5"${dash} stroke-linecap="round"/>`
      )
    }
    for (const c of layout.crossings) {
      parts.push(
        `<rect x="${(c.x - 3).toFixed(1)}" y="${(c.y - 6).toFixed(1)}" width="6" height="12" rx="3" fill="currentColor" data-crossing="true"/>`
      )
      parts.push(
        `<text x="${(c.x + 6).toFixed(1)}" y="${(c.y - 8).toFixed(1)}" font-size="12" fill="currentColor">${escapeXml(c.label)}</text>`
      )
    }
  }

  for (const mark of layout.warningMarks) {
    parts.push(
      `<rect x="${mark.x1.toFixed(1)}" y="0" width="${Math.max(1, mark.x2 - mark.x1).toFixed(1)}" height="4" rx="2" fill="currentColor" opacity="0.35"><title>${escapeXml(mark.text)}</title></rect>`
    )
  }

  for (const mark of layout.crowdMarks) {
    parts.push(
      `<rect x="${mark.ax1.toFixed(1)}" width="${Math.max(1, mark.ax2 - mark.ax1).toFixed(1)}" y="0" height="6" rx="3" fill="currentColor" opacity="0.12"/>`
    )
    if (mark.ex1 !== null && mark.ex2 !== null) {
      parts.push(
        `<rect x="${mark.ex1.toFixed(1)}" width="${Math.max(1, mark.ex2 - mark.ex1).toFixed(1)}" y="0" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>`
      )
    }
  }

  for (const e of layout.errorMarks) {
    const cx = (e.x1 + e.x2) / 2
    parts.push(
      `<g stroke="currentColor" stroke-width="1.5" data-error="true"><line x1="${(cx - 4).toFixed(1)}" y1="18" x2="${(cx + 4).toFixed(1)}" y2="26"/><line x1="${(cx + 4).toFixed(1)}" y1="18" x2="${(cx - 4).toFixed(1)}" y2="26"/></g>`
    )
  }

  if (layout.windowsY !== null && options.windowLane !== false) {
    for (const mark of layout.windowMarks) parts.push(capsuleSvg(mark, layout.windowsY))
  }

  if (layout.nowInSpan) {
    parts.push(
      `<line x1="${layout.nowX.toFixed(1)}" y1="${HEADER}" x2="${layout.nowX.toFixed(1)}" y2="${(layout.height - X_AXIS).toFixed(1)}" stroke="currentColor" stroke-width="2" stroke-linecap="round" data-now="true"/>`
    )
    parts.push(
      `<text x="${(layout.nowX + 4).toFixed(1)}" y="${HEADER - 4}" font-size="10" fill="currentColor">Now MYT</text>`
    )
  }

  parts.push('</svg>')
  return parts.join('')
}
