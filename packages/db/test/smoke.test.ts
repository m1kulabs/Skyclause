import { expect, test } from 'vitest'

test('@skyclause/db resolves through its package exports', async () => {
  await expect(import('@skyclause/db')).resolves.toBeTypeOf('object')
})
