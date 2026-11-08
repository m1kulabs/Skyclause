import type { Context } from 'hono'

// TRD "API conventions" and SDK-5: a deprecated operation sends `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) at
// least six months before its removal.
export function deprecate(c: Context, o: { deprecatedAt: Date; sunsetAt: Date; link?: string }) {
  const earliest = new Date(o.deprecatedAt)
  earliest.setUTCMonth(earliest.getUTCMonth() + 6)
  if (o.sunsetAt < earliest) throw new Error('SDK-5: a sunset must be at least six months after its deprecation')
  c.header('Deprecation', `@${Math.floor(o.deprecatedAt.getTime() / 1000)}`)
  c.header('Sunset', o.sunsetAt.toUTCString())
  if (o.link) c.header('Link', `<${o.link}>; rel="deprecation"`, { append: true })
}
