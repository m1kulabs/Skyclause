// Acceptance: Better Auth's schema generation for the runtime configuration diffs clean against the committed `auth`
// schema (#91's tables plus #92's columns), so a plugin owner configures flows, never schema.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

test('the Better Auth CLI generates exactly packages/db’s auth schema from the runtime configuration', () => {
  const script = fileURLToPath(new URL('../../db/scripts/generate-auth.ts', import.meta.url))
  const config = fileURLToPath(new URL('./fixtures/auth.config.ts', import.meta.url))
  const result = spawnSync('bun', [script, '--check', '--config', config], { encoding: 'utf8' })
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('matches the Better Auth CLI output')
  expect(result.status).toBe(0)
}, 60_000)
