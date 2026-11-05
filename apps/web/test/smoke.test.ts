import { expect, test } from 'vitest'
import { GET } from '../app/healthz/route'
import { db } from '../lib/db'

test('GET /healthz answers 200 for the deploy smoke', async () => {
  const res = GET()
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('ok')
})

test('the composition root reaches @skyclause/db', () => {
  expect(db).toBeTypeOf('object')
})
