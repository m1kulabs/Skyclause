import type { Instant, SpanRef, Window } from './types'

export interface ParsedSpanRef {
  anchor: 'start' | 'end'
  offsetMs: number
}

const SPAN_REF_RE = /^(start|end)(?:([+-])(\d+)([smhd]))?$/

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
}

export function parseSpanRef(ref: SpanRef): ParsedSpanRef | null {
  const match = SPAN_REF_RE.exec(ref.trim())
  if (!match) return null
  const anchor = match[1] as 'start' | 'end'
  const sign = match[2]
  const amount = match[3]
  const unit = match[4]
  if (!sign || !amount || !unit) {
    return { anchor, offsetMs: 0 }
  }
  const delta = Number(amount) * (UNIT_MS[unit] ?? 0)
  return {
    anchor,
    offsetMs: sign === '-' ? -delta : delta
  }
}

export function validateSpan(span: { from: SpanRef; to: SpanRef }): { ok: true } | { ok: false; message: string } {
  const from = parseSpanRef(span.from)
  if (!from) {
    return { ok: false, message: `Invalid span.from '${span.from}'; expected (start|end)[+-]<n>(s|m|h|d)` }
  }
  const to = parseSpanRef(span.to)
  if (!to) {
    return { ok: false, message: `Invalid span.to '${span.to}'; expected (start|end)[+-]<n>(s|m|h|d)` }
  }
  if (from.anchor === to.anchor && from.offsetMs >= to.offsetMs) {
    return { ok: false, message: `Reversed or empty span: '${span.from}' must precede '${span.to}'` }
  }
  if (from.anchor === 'end' && to.anchor === 'start' && from.offsetMs >= to.offsetMs) {
    return { ok: false, message: `Reversed or empty span: '${span.from}' must precede '${span.to}'` }
  }
  return { ok: true }
}

export function formatInstant(ms: number): Instant {
  const iso = new Date(ms).toISOString()
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso
}

export function resolveWindowSpan(
  window: Pick<Window, 'startsAt' | 'endsAt'>,
  span?: { from: SpanRef; to: SpanRef }
): { fromMs: number; toMs: number; from: Instant; to: Instant } {
  const startMs = Date.parse(window.startsAt)
  const endMs = Date.parse(window.endsAt)
  if (!span) {
    return {
      fromMs: startMs,
      toMs: endMs,
      from: formatInstant(startMs),
      to: formatInstant(endMs)
    }
  }
  const fromParsed = parseSpanRef(span.from) ?? { anchor: 'start', offsetMs: 0 }
  const toParsed = parseSpanRef(span.to) ?? { anchor: 'end', offsetMs: 0 }
  const fromMs = (fromParsed.anchor === 'start' ? startMs : endMs) + fromParsed.offsetMs
  const toMs = (toParsed.anchor === 'start' ? startMs : endMs) + toParsed.offsetMs
  return {
    fromMs,
    toMs,
    from: formatInstant(fromMs),
    to: formatInstant(toMs)
  }
}
