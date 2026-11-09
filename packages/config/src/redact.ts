import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace'

// #114 ticket decision: Skyclause tokens, Authorization and Cookie values, provider key shapes and email
// addresses never leave the process in a log field, span attribute or error message (TRD BYOK); #157 adds subscriber
// link tokens.
const REDACTED = '[redacted]'

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  // Header text, such as a request dumped into an error message.
  [/\b(authorization|proxy-authorization|cookie|set-cookie)(\s*[:=]\s*)[^\r\n]*/gi, `$1$2${REDACTED}`],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // Google OAuth access tokens, such as Vertex AI's.
  [/ya29\.[A-Za-z0-9._-]+/g, REDACTED],
  // API keys `skc_`, guest tokens `skg_`, webhook secrets `skw_` (D38).
  [/sk[cgw]_[A-Za-z0-9_-]+/g, REDACTED],
  // Google AI Studio, then OpenAI, Anthropic and OpenRouter (`sk-`, `sk-proj-`, `sk-ant-`, `sk-or-v1-`).
  [/AIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED],
  // Subscriber link tokens (#157), which have no prefix: 32 bytes of base64url in a `/subscribe/` path.
  [/(\/subscribe\/)[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, `$1${REDACTED}`],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED]
]

/** A key whose whole value is a credential: `authorization`, `http.request.header.cookie`, `x-api-key`, `password`. */
const SECRET_KEY = /(?:^|[._-])(?:proxy-)?(?:authorization|cookie|set-cookie|api[-_]?key|password|secret|token)$/i

export function redactText(text: string): string {
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

/** A deep copy with every string scrubbed, credential keys blanked and errors as `{name, message, stack}`. */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack && redactText(value.stack),
      cause: value.cause === undefined ? undefined : redact(value.cause, seen)
    }
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? REDACTED : redact(item, seen)])
  )
}

function redactAttributes<T extends object | undefined>(attributes: T): T {
  return (attributes && redact(attributes)) as T
}

/** Passes a scrubbed copy of each ended span to the processor that exports it. */
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly next: SpanProcessor) {}

  onStart(span: Span, parentContext: Context) {
    this.next.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan) {
    this.next.onEnd({
      name: redactText(span.name),
      kind: span.kind,
      spanContext: () => span.spanContext(),
      parentSpanContext: span.parentSpanContext,
      startTime: span.startTime,
      endTime: span.endTime,
      status: { ...span.status, message: span.status.message && redactText(span.status.message) },
      attributes: redactAttributes(span.attributes),
      links: span.links.map((link) => ({ ...link, attributes: redactAttributes(link.attributes) })),
      events: span.events.map((event) => ({
        ...event,
        name: redactText(event.name),
        attributes: redactAttributes(event.attributes)
      })),
      duration: span.duration,
      ended: span.ended,
      resource: span.resource,
      instrumentationScope: span.instrumentationScope,
      droppedAttributesCount: span.droppedAttributesCount,
      droppedEventsCount: span.droppedEventsCount,
      droppedLinksCount: span.droppedLinksCount
    })
  }

  forceFlush() {
    return this.next.forceFlush()
  }

  shutdown() {
    return this.next.shutdown()
  }
}
