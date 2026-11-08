// Spec conventions: `snake_case` on the wire and instants as RFC 3339 UTC.

/** RFC 3339 UTC, without a fractional part when it is zero. */
export const instant = (date: Date) => date.toISOString().replace('.000Z', 'Z')

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

/** Converts a domain value for a response body: camelCase keys to snake_case and `Date`s to `instant`, deeply. */
export function toWire(value: unknown): unknown {
  if (value instanceof Date) return instant(value)
  if (Array.isArray(value)) return value.map(toWire)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [snake(key), toWire(item)]))
  }
  return value
}
