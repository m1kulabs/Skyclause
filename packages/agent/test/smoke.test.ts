import { expect, test } from 'vitest'

test('@skyclause/agent resolves through its package exports', async () => {
  await expect(import('@skyclause/agent')).resolves.toBeTypeOf('object')
})
