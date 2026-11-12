import { expect, test } from 'vitest'
import { browserPath } from '../../lib/api-fetch'

// #737: the browser's event streams take the same same-origin path as its apiFetch reads.
test.each([
  ['/v1/events/stream', '/api/v1/events/stream'],
  ['/v1/projects/p-1/bundles/stream', '/api/v1/projects/p-1/bundles/stream'],
  ['/v1/projects/p-1/readings/stream', '/api/v1/projects/p-1/readings/stream'],
  ['/api/notifications/stream', '/api/notifications/stream']
])('browserPath(%j) is %j', (path, expected) => {
  expect(browserPath(path)).toBe(expected)
})
