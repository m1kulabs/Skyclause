import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const pkg = fileURLToPath(new URL('..', import.meta.url))

test('two parallel Vitest workers each get their own clone and see none of each other’s rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skyclause-isolation-'))
  try {
    const run = spawnSync('bun', ['x', 'vitest', 'run', '--config', 'test/isolation/vitest.config.ts'], {
      cwd: pkg,
      encoding: 'utf8',
      env: { ...process.env, SKYCLAUSE_ISOLATION_DIR: dir }
    })
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(run.stdout).toMatch(/2 passed/)
    const databases = ['a', 'b'].map((worker) => readFileSync(join(dir, worker), 'utf8'))
    expect(new Set(databases).size).toBe(2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 90_000)
