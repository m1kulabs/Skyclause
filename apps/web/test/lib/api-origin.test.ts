import { expect, test } from 'vitest'
import { ApiOriginError, serverApiOrigin } from '../../lib/api-origin'

const api = 'https://api.example.test'
const app = 'https://app.example.test'

test.each([
  ['API_ORIGIN when set', { API_ORIGIN: api, APP_ORIGIN: app, HOST_MODE: 'single' }, api],
  ['API_ORIGIN in multi-host mode', { API_ORIGIN: api, APP_ORIGIN: app, HOST_MODE: 'multi' }, api],
  ['APP_ORIGIN under HOST_MODE=single', { HOST_MODE: 'single', APP_ORIGIN: app }, app],
  ['APP_ORIGIN when HOST_MODE is unset, which is single', { APP_ORIGIN: app }, app],
  ['APP_ORIGIN when API_ORIGIN is empty', { HOST_MODE: 'single', API_ORIGIN: '', APP_ORIGIN: app }, app]
])('resolves %s', (_name, env, origin) => {
  expect(serverApiOrigin(env)).toBe(origin)
})

test.each([
  ['nothing is set', {}],
  ['single-host mode has no APP_ORIGIN either', { HOST_MODE: 'single', API_ORIGIN: '', APP_ORIGIN: '' }],
  ['multi-host mode has only APP_ORIGIN, which is the app host, not the API', { HOST_MODE: 'multi', APP_ORIGIN: app }]
])('throws a configuration error naming API_ORIGIN when %s', (_name, env) => {
  expect(() => serverApiOrigin(env)).toThrow(ApiOriginError)
  expect(() => serverApiOrigin(env)).toThrow(/API_ORIGIN/)
})
