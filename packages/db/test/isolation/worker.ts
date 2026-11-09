import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { authDatabase } from '../../src/auth'
import { organization } from '../../src/schema'
import { makeOrganization } from '../factories'
import { testDatabase } from '../harness'

/**
 * Each fixture file adds one organisation, then waits until the other worker has added its own before counting: a shared
 * database would show two. SKYCLAUSE_ISOLATION_DIR is isolation.test.ts's scratch directory.
 */
export function isolatedWorker(self: string, other: string) {
  test(`worker ${self} sees only its own rows`, async () => {
    const dir = process.env.SKYCLAUSE_ISOLATION_DIR!
    await makeOrganization({ name: self })
    writeFileSync(join(dir, self), testDatabase())
    for (let waited = 0; !existsSync(join(dir, other)); waited += 50) {
      if (waited > 30_000) throw new Error(`worker ${other} never started: the two files didn't run in parallel`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const names = await authDatabase().select({ name: organization.name }).from(organization)
    expect(names).toEqual([{ name: self }])
  }, 40_000)
}
