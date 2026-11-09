import type { Page } from '@skyclause/contracts'
import { ApiError } from './problems'

// TRD "API conventions": `limit` and an opaque `cursor`; `{ data, next_cursor }` with a string while more remain.

export const encodeCursor = (position: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(position)).toString('base64url')

/** The position `encodeCursor` wrote; any other string is 422 `validation-failed` on `cursor`. */
export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    // Falls through to the problem below.
  }
  throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
    errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
  })
}

/** Given up to `limit + 1` rows, the first `limit` and the cursor after the last of them if another row remains. */
export function page<T>(rows: T[], limit: number, cursorOf: (row: T) => Record<string, unknown>): Page<T> {
  const data = rows.slice(0, limit)
  const last = data.at(-1)
  return { data, next_cursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null }
}
