// Projections can contain native Sheets Dates or explicit-offset ISO strings.
// Missing metadata must never silently acquire an epoch or an unbounded interval.
function instant(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value !== 'string') return null
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) return null
  const day = Date.parse(`${parts[1]}T00:00:00Z`)
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== parts[1]) return null
  if (Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4] ?? 0) > 59) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function metNamesKl(input: { title_en: string; text_en: string; text_bm: string }): boolean {
  return !/no advisory|rough seas/i.test(input.title_en) && /kuala lumpur/i.test(`${input.text_en}\n${input.text_bm}`)
}

export function metWarningInForce(
  row: { title_en?: unknown; valid_from?: unknown; valid_to?: unknown },
  startMs: number,
  endMs: number
): boolean {
  if (typeof row.title_en === 'string' && /no advisory/i.test(row.title_en)) return false
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return false
  const from = instant(row.valid_from)
  const to = instant(row.valid_to)
  return from !== null && to !== null && from <= to && from <= endMs && to >= startMs
}

// Callers apply their own availability policy before selecting a revision.
// Select before relevance/validity filtering so an expired replacement wins.
export function latestMetWarningRows<T extends { warning_key?: unknown; issued?: unknown; first_seen_at?: unknown }>(
  rows: readonly T[]
): T[] {
  const latest = new Map<string, { row: T; issued: number; seen: number }>()
  for (const row of rows) {
    if (typeof row.warning_key !== 'string' || row.warning_key.trim() === '') continue
    const issued = instant(row.issued)
    const seen = instant(row.first_seen_at)
    if (issued === null || seen === null) continue
    const previous = latest.get(row.warning_key)
    if (!previous || issued > previous.issued || (issued === previous.issued && seen >= previous.seen)) {
      latest.set(row.warning_key, { row, issued, seen })
    }
  }
  return [...latest.values()].map(({ row }) => row)
}
