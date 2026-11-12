import type { ReadingInput, Source } from '../contract'
import { SOURCE_METRICS } from '../contract'
import { SchemaError } from '../errors'
import type { z } from 'zod'

type WarningValue = ReadingInput<'met_warning'>['valueJson']
const rawSchema = SOURCE_METRICS.met_warning.warning.value_json.omit({
  valid_from_utc: true,
  valid_to_utc: true,
  excluded: true
})
type WarningRaw = z.infer<typeof rawSchema>

export function validateMetWarningSources(sources: Source[]): void {
  if (
    !sources.length ||
    sources.some((source) => source.kind !== 'met_warning' || source.externalId !== 'met-warnings')
  ) {
    throw new SchemaError('Expected bound MET warning singleton sources')
  }
}

function utcTimestamp(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) throw new SchemaError('Invalid MET MYT timestamp')
  const ms = Date.parse(`${raw}+08:00`)
  if (!Number.isFinite(ms) || new Date(ms + 8 * 3600_000).toISOString().slice(0, 19) !== raw) {
    throw new SchemaError(`Invalid MET MYT timestamp: ${raw}`)
  }
  return new Date(ms).toISOString()
}

export function parseMetWarnings(raw: unknown, sources: Source[]): ReadingInput<'met_warning'>[] {
  validateMetWarningSources(sources)
  if (!Array.isArray(raw)) throw new SchemaError('Expected MET warning array')
  const readings: ReadingInput<'met_warning'>[] = []
  const seen = new Map<string, string>()
  for (const value of raw) {
    if (!rawSchema.safeParse(value).success) throw new SchemaError('Invalid MET warning record')
    // Validate without stripping unknown provider properties, including nested issue fields.
    const row = value as WarningRaw
    const observedAt = utcTimestamp(row.warning_issue.issued)
    const validFrom = row.valid_from === null ? null : utcTimestamp(row.valid_from)
    const validTo = row.valid_to === null ? null : utcTimestamp(row.valid_to)
    if (validFrom !== null && validTo !== null && validFrom > validTo)
      throw new SchemaError('Reversed MET warning validity')
    const title = row.warning_issue.title_en.toLowerCase()
    const valueJson = {
      ...row,
      valid_from_utc: validFrom,
      valid_to_utc: validTo,
      excluded: title === 'no advisory' || title.includes('rough seas')
    } as WarningValue
    const itemKey = `${row.warning_issue.title_en}|${row.valid_from}`
    const identity = `${observedAt}|${itemKey}`
    const serialized = canonicalJson(row)
    if (seen.has(identity)) {
      if (seen.get(identity) !== serialized) throw new SchemaError(`Conflicting MET warning identity: ${identity}`)
      continue
    }
    seen.set(identity, serialized)
    for (const source of new Map(sources.map((source) => [source.id, source])).values()) {
      readings.push({
        sourceId: source.id,
        metric: 'warning',
        observedAt,
        value: null,
        valueText: row.text_en,
        valueJson,
        unit: null,
        itemKey
      })
    }
  }
  return readings
}

// Comparing JSON content avoids treating provider object-key order as a revision.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      return Object.fromEntries(Object.entries(current).sort(([left], [right]) => left.localeCompare(right)))
    }
    return current
  })
}

export function isMetWarningInForce(
  value: WarningValue,
  span: { from: string; to: string },
  areaTerms: readonly string[]
): boolean {
  if (value.excluded || value.valid_from_utc === null || value.valid_to_utc === null) return false
  const texts = [value.text_en.toLowerCase(), value.text_bm.toLowerCase()]
  if (
    !areaTerms.some((term) => term.trim().length > 0 && texts.some((text) => text.includes(term.trim().toLowerCase())))
  )
    return false
  const from = Date.parse(value.valid_from_utc)
  const to = Date.parse(value.valid_to_utc)
  const spanFrom = Date.parse(span.from)
  const spanTo = Date.parse(span.to)
  return from <= to && spanFrom <= spanTo && from <= spanTo && to >= spanFrom
}
