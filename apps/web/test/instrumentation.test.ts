import { context, metrics, propagation, trace } from '@opentelemetry/api'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { register } from '../instrumentation'

let exit: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs')
  exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const api of [trace, metrics, propagation, context]) api.disable()
})

test('the web server exits at start naming a missing APP_ENV', async () => {
  vi.stubEnv('APP_ENV', undefined)
  await register()
  expect(exit).toHaveBeenCalledWith(1)
  expect(String(error.mock.calls[0]?.[0])).toMatch(/APP_ENV/)
})

test('the web server exits at start on APP_ENV=test under Cloud Run', async () => {
  vi.stubEnv('APP_ENV', 'test')
  vi.stubEnv('K_SERVICE', 'web')
  await register()
  expect(exit).toHaveBeenCalledWith(1)
  expect(String(error.mock.calls[0]?.[0])).toMatch(/APP_ENV=test/)
})

test('the web server starts with a valid environment, and its telemetry traces', async () => {
  vi.stubEnv('APP_ENV', 'production')
  await register()
  expect(exit).not.toHaveBeenCalled()
  const span = trace.getTracer('test').startSpan('GET /')
  expect(span.spanContext().traceId).toMatch(/^(?!0{32})[0-9a-f]{32}$/)
  span.end()
})
