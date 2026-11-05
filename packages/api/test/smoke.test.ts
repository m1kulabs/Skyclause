import { expect, test } from 'vitest'

test('@skyclause/api resolves through its package exports', async () => {
  await expect(import('@skyclause/api')).resolves.toBeTypeOf('object')
})
