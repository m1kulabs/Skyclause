import { expect, test } from 'vitest'

test('@skyclause/mcp resolves through its package exports', async () => {
  await expect(import('@skyclause/mcp')).resolves.toBeTypeOf('object')
})
