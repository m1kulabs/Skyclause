import type { FieldErrors } from './model'

/** RFC 9457 errors may use JSON pointers, dotted paths, or a field-to-message map. */
export function problemFields(value: unknown): FieldErrors {
  const aliases: Record<string, keyof FieldErrors> = {
    starts_at: 'start',
    ends_at: 'end',
    days_of_week: 'days',
    skip_dates: 'skips',
    recurrence: 'days',
    title: 'title',
    kind: 'kind',
    date: 'date',
    until: 'until',
    count: 'count',
    url: 'url',
    file: 'file',
    scope: 'scope',
    start: 'start',
    end: 'end'
  }
  const result: FieldErrors = {}
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([field, message]) => ({ field, message }))
      : []
  const codes = new Set([
    'end_before_start',
    'too_long',
    'too_far',
    'past',
    'days_required',
    'until_invalid',
    'count_invalid',
    'skips_invalid',
    'title_required'
  ])
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const raw = item.field ?? item.path ?? item.pointer ?? item.name
    const path = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/[./]/)
    let field = path
      .map((part) => aliases[String(part)])
      .filter(Boolean)
      .at(-1)
    const code = typeof item.code === 'string' ? item.code.replaceAll('-', '_') : ''
    if (field === 'start' && code === 'too_far') field = 'date'
    if (!field) continue
    const message =
      typeof item.message === 'string'
        ? item.message
        : Array.isArray(item.message)
          ? item.message.filter((part) => typeof part === 'string').join(' ')
          : ''
    result[field] = codes.has(code) ? code : message ? `server:${message}` : 'server_error'
  }
  return result
}
