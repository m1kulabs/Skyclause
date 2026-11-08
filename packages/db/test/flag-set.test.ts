// #79 §6 flags change only through the audited `flag:set` script.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { featureFlag, isFlagEnabled, withSystem, withTenant } from '../src'
import { makeOrganization } from './factories'
import { expectOneAudit, memberOf, refusal } from './harness'

const script = fileURLToPath(new URL('../scripts/flag-set.ts', import.meta.url))
const flagSet = (...args: string[]) => spawnSync('bun', [script, ...args], { encoding: 'utf8', env: process.env })

test('flag:set pack_crowd on --org <id> writes the flag and one audit row; off changes it again', async () => {
  const orgId = (await makeOrganization()).id
  const on = flagSet('pack_crowd', 'on', '--org', orgId)
  expect(on.stderr).toBe('')
  expect(on.stdout).toBe(`pack_crowd on for organisation ${orgId}\n`)
  expect(await withTenant({ orgId, principal: memberOf(orgId) }, (tx) => isFlagEnabled(tx, 'pack_crowd', orgId))).toBe(
    true
  )
  expect(await expectOneAudit('flag.changed', { orgId })).toMatchObject({
    actor_type: 'system',
    actor_id: 'flag:set',
    target_type: 'feature_flag',
    target_id: 'pack_crowd',
    before: null,
    after: { enabled: true, org_id: orgId }
  })
  expect(flagSet('pack_crowd', 'off', '--org', orgId).status).toBe(0)
  const flags = await withSystem('test', (tx) =>
    tx
      .select()
      .from(featureFlag)
      .where(and(eq(featureFlag.key, 'pack_crowd'), eq(featureFlag.orgId, orgId)))
  )
  expect(flags.map(({ enabled }) => enabled)).toEqual([false])
})

test('a global flag is audited on the commons organisation, and fails without it (D9: no fallback)', async () => {
  const missing = flagSet('guest_entry', 'on')
  expect(missing.status).toBe(1)
  expect(missing.stderr).toMatch(/commons/)
  const commons = (await makeOrganization({ slug: 'commons' })).id
  expect(flagSet('guest_entry', 'on').status).toBe(0)
  expect(await expectOneAudit('flag.changed', { orgId: commons, targetId: 'guest_entry' })).toMatchObject({
    after: { enabled: true, org_id: null }
  })
  const global = await withSystem('test', (tx) =>
    tx
      .select()
      .from(featureFlag)
      .where(and(eq(featureFlag.key, 'guest_entry'), isNull(featureFlag.orgId)))
  )
  expect(global.map(({ enabled }) => enabled)).toEqual([true])
})

test('flag:set refuses an unknown flag or state, writing nothing', () => {
  for (const args of [['dark_mode', 'on'], ['pack_crowd', 'maybe'], ['pack_crowd']]) {
    const result = flagSet(...args)
    expect(result.status, args.join(' ')).toBe(1)
    expect(result.stderr).toMatch(/usage: flag:set/)
  }
})

test('app can’t change feature_flag', async () => {
  const orgId = (await makeOrganization()).id
  const asApp = withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    tx.execute(sql`INSERT INTO feature_flag (key, org_id, enabled) VALUES ('pack_crowd', ${orgId}, true)`)
  )
  expect(await refusal(asApp)).toMatch(/permission denied for table feature_flag/)
})
