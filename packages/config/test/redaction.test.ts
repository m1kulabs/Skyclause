import { SpanStatusCode, trace } from '@opentelemetry/api'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import fc from 'fast-check'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { log, startTelemetry, type Telemetry } from '@skyclause/config'

// Each planted value is `text`, which goes where a secret would; `secret` must never reach an exporter double.
interface Plant {
  text: string
  secret: string
}

const chars = (alphabet: string, min: number, max: number) =>
  fc.string({ unit: fc.constantFrom(...alphabet), minLength: min, maxLength: max })
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const plants: fc.Arbitrary<Plant> = fc.oneof(
  fc
    .tuple(fc.constantFrom('skc_', 'skg_', 'skw_'), chars(`${ALNUM}_-`, 12, 40))
    .map(([prefix, body]) => ({ text: prefix + body, secret: prefix + body })),
  chars(`${ALNUM}_-`, 35, 35).map((body) => ({ text: `AIza${body}`, secret: `AIza${body}` })),
  fc
    .tuple(fc.constantFrom('sk-', 'sk-proj-', 'sk-ant-api03-', 'sk-or-v1-'), chars(ALNUM, 20, 48))
    .map(([prefix, body]) => ({ text: prefix + body, secret: body })),
  fc
    .tuple(fc.constantFrom('AKIA', 'ASIA'), chars('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 16, 16))
    .map(([prefix, body]) => ({ text: prefix + body, secret: prefix + body })),
  chars(`${ALNUM}._-`, 16, 60).map((token) => ({ text: `Authorization: Bearer ${token}`, secret: token })),
  chars(ALNUM, 16, 40).map((token) => ({ text: `bearer ${token}`, secret: token })),
  chars(ALNUM, 16, 40).map((token) => ({ text: `authorization=${token}`, secret: token })),
  chars(`${ALNUM}_-`, 30, 60).map((token) => ({ text: `ya29.${token}`, secret: token })),
  chars(ALNUM, 16, 40).map((value) => ({
    text: `Cookie: better-auth.session_token=${value}; sc_share=${value}`,
    secret: value
  })),
  fc
    .tuple(
      chars('abcdefghijklmnopqrstuvwxyz0123456789._+-', 1, 20),
      chars('abcdefghijklmnopqrstuvwxyz0123456789-', 1, 20)
    )
    .map(([local, domain]) => ({ text: `${local}@${domain}.example.my`, secret: `${local}@${domain}.example.my` })),
  chars(`${ALNUM}+/`, 40, 80).map((body) => ({
    text: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
    secret: body
  }))
)

/** Surrounding text, kept apart from the secret by a separator a real message would have. */
const filler = fc.string({ maxLength: 20 })
const separator = fc.constantFrom(' ', '\n', '=', '"', "'", '(', ': ', '/', '?key=')
const sentence = fc
  .tuple(filler, separator, plants, separator, filler)
  .map(([before, open, plant, close, after]) => ({ ...plant, text: `${before}${open}${plant.text}${close}${after}` }))

/** Nests a value under random keys and arrays, up to three levels deep. */
const nested = (value: unknown) =>
  fc
    .array(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 8 }).map((key) => ({ key })),
        fc.constant('array' as const)
      ),
      {
        maxLength: 3
      }
    )
    .map((path) =>
      path.reduceRight<unknown>((inner, step) => (step === 'array' ? [inner] : { [step.key]: inner }), value)
    )

let telemetry: Telemetry
let lines: string[]
const spans = new InMemorySpanExporter()

beforeAll(() => {
  telemetry = startTelemetry('job', {
    env: { APP_ENV: 'production', GCP_PROJECT: 'skyclause', LOG_LEVEL: 'debug' },
    traceExporter: spans,
    metricExporter: {
      export: (_metrics, done) => done({ code: 0 }),
      forceFlush: async () => {},
      shutdown: async () => {}
    },
    write: (line) => void lines.push(line)
  })
})

afterAll(() => telemetry.shutdown())

beforeEach(() => {
  lines = []
  spans.reset()
})

async function exported() {
  await telemetry.flush()
  const text = [
    ...lines,
    JSON.stringify(
      spans.getFinishedSpans().map((span) => ({
        name: span.name,
        status: span.status,
        attributes: span.attributes,
        events: span.events,
        links: span.links
      }))
    )
  ].join('\n')
  lines = []
  spans.reset()
  return text
}

describe('redaction before export', () => {
  test('log messages and fields at any depth', async () => {
    await fc.assert(
      fc.asyncProperty(
        sentence,
        sentence.chain((plant) => nested(plant.text).map((field) => ({ plant, field }))),
        async (message, { plant, field }) => {
          log.info(message.text, { field })
          const out = await exported()
          expect(out).not.toContain(message.secret)
          expect(out).not.toContain(plant.secret)
        }
      )
    )
  })

  test('span names, attributes, events and statuses', async () => {
    await fc.assert(
      fc.asyncProperty(sentence, sentence, sentence, async (name, attribute, status) => {
        const span = trace.getTracer('test').startSpan(name.text, {
          attributes: {
            'url.full': attribute.text,
            'http.request.header.cookie': [status.text],
            tags: [attribute.text]
          }
        })
        span.addEvent(name.text, { detail: attribute.text })
        span.setStatus({ code: SpanStatusCode.ERROR, message: status.text })
        span.end()
        const out = await exported()
        for (const plant of [name, attribute, status]) expect(out).not.toContain(plant.secret)
      })
    )
  })

  test('thrown errors and their causes, logged or recorded on a span', async () => {
    await fc.assert(
      fc.asyncProperty(sentence, async (plant) => {
        const error = new Error(plant.text)
        log.error('handler failed', { error: new Error('send failed', { cause: error }) })
        const span = trace.getTracer('test').startSpan('handler')
        span.recordException(error)
        span.end()
        expect(await exported()).not.toContain(plant.secret)
      })
    )
  })

  test('Authorization, Cookie and other credential values under their keys, whatever they hold', async () => {
    await fc.assert(
      fc.asyncProperty(chars(ALNUM, 12, 40), async (value) => {
        log.info('request', {
          headers: { Authorization: value, cookie: value, 'Set-Cookie': [value], 'x-api-key': value },
          password: value,
          webhook: { secret: value, token: value }
        })
        trace
          .getTracer('test')
          .startSpan('GET /api', { attributes: { 'http.request.header.authorization': [value] } })
          .end()
        expect(await exported()).not.toContain(value)
      })
    )
  })

  test('ordinary text passes through unchanged', async () => {
    log.info('poll failed for jps-3117070 with 503 after 1.2 s', { station: 'Sg. Kuyoh di LRT Bukit Jalil' })
    expect(JSON.parse(await exported().then((out) => out.split('\n')[0] ?? ''))).toMatchObject({
      message: 'poll failed for jps-3117070 with 503 after 1.2 s',
      station: 'Sg. Kuyoh di LRT Bukit Jalil'
    })
  })
})
