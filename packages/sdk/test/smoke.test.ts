import { expect, test } from 'vitest'

test('@skyclause/sdk resolves through its package exports', async () => {
  await expect(import('@skyclause/sdk')).resolves.toBeTypeOf('object')
})
