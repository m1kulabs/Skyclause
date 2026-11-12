import { afterEach, expect, test, vi } from 'vitest'

afterEach(async () => {
  const { setRunPublisher } = await import('../src/runs/request')
  setRunPublisher(null)
})

// Next.js may load packages/db once for instrumentation.ts (where the web sets the publisher) and again for the
// route handlers (where createRun publishes). The publisher has to be visible to both copies.
test('a run publisher set through one module instance is seen by another', async () => {
  const first = await import('../src/runs/request')
  const publish = async () => {}
  first.setRunPublisher(publish)
  vi.resetModules()
  const second = await import('../src/runs/request')
  expect(second).not.toBe(first)
  expect(second.runPublisher()).toBe(publish)
  second.setRunPublisher(null)
  expect(first.runPublisher()).toBeNull()
})
