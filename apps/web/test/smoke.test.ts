import { expect, test } from 'vitest'

// A cold import of the whole package can take several seconds when the full suite runs in parallel.
import { GET } from '../app/health/route'
import { db } from '../lib/db'

test('GET /health answers 200 for the deploy smoke', async () => {
  const res = GET()
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('ok')
})

test('the composition root reaches @skyclause/db', () => {
  expect(db).toBeTypeOf('object')
}, 30_000)
