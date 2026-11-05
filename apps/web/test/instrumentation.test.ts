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
})

test('the web server exits at start naming a missing APP_ENV', () => {
  vi.stubEnv('APP_ENV', undefined)
  register()
  expect(exit).toHaveBeenCalledWith(1)
  expect(String(error.mock.calls[0]?.[0])).toMatch(/APP_ENV/)
})

test('the web server exits at start on APP_ENV=test under Cloud Run', () => {
  vi.stubEnv('APP_ENV', 'test')
  vi.stubEnv('K_SERVICE', 'web')
  register()
  expect(exit).toHaveBeenCalledWith(1)
  expect(String(error.mock.calls[0]?.[0])).toMatch(/APP_ENV=test/)
})

test('the web server starts with a valid environment', () => {
  vi.stubEnv('APP_ENV', 'staging')
  register()
  expect(exit).not.toHaveBeenCalled()
})
