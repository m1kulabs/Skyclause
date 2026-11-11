// #112 (a-retention): the retention job is registered, and refuses without its buckets.
import { expect, test } from 'vitest'
import { registry } from '../src/registry'

test('the retention job is registered under a-retention', () => {
  expect(registry.jobs['retention']).toBeDefined()
})

test('the retention job names the buckets it needs', async () => {
  await expect(registry.jobs['retention']!([])).rejects.toThrow(/retention needs FRAMES_BUCKET, EXPORTS_BUCKET/)
})
