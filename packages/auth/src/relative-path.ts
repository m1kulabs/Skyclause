// Safe for the browser: no imports. The one rule for a return path (`next`) on the web and in the sign-in plugin: the
// rule Better Auth's isSafeRelativeURL applies to a relative callback URL (better-auth/dist/auth/trusted-origins.mjs),
// plus a length cap so a return path never outgrows a proxy's or Google's URL limits.

/** The longest return path kept. */
export const MAX_RETURN_PATH = 2000
// eslint-disable-next-line no-control-regex -- C0 and C1 controls are exactly what a return path must not carry.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const ENCODED_SEPARATOR = /%2[fF]|%5[cC]/
const PARSER_ORIGIN = 'https://relative.invalid'

/**
 * `value` as a same-origin path with its query and hash, or null for anything that could leave the origin or is
 * malformed: not a single leading slash, a backslash, a control character, an encoded slash or backslash in the path,
 * or more than MAX_RETURN_PATH characters.
 */
export function safeRelativePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_RETURN_PATH) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || CONTROL.test(value)) return null
  const pathEnd = value.search(/[?#]/)
  if (ENCODED_SEPARATOR.test(pathEnd === -1 ? value : value.slice(0, pathEnd))) return null
  try {
    const resolved = new URL(value, PARSER_ORIGIN)
    return resolved.origin === PARSER_ORIGIN ? `${resolved.pathname}${resolved.search}${resolved.hash}` : null
  } catch {
    return null
  }
}
