import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { findMembership } from '../src/api'
import { withSystem } from '../src/client'
import { makeMember, makeOrganization, makeUser } from './factories'
import { asLogin, refusal } from './harness'

// f-api's S tables (#79 §3, system_table): schema.test.ts checks that app and public_reader reach neither; here, what
// system and retention may do, and that auth_app reaches neither. The store queries' behaviour is
// packages/api/test/stores.test.ts's contract, run on this database.
test('system reads and writes f-api’s tables; retention reads, updates and deletes; auth_app reaches neither', async () => {
  for (const table of ['idempotency_key', 'rate_limit']) {
    const column = table === 'rate_limit' ? 'count' : 'key'
    const select = `SELECT FROM public.${table}`
    const insert = `INSERT INTO public.${table} DEFAULT VALUES`
    const update = `UPDATE public.${table} SET ${column} = ${column} WHERE false`
    const remove = `DELETE FROM public.${table} WHERE false`
    await asLogin('system', async (client) => {
      for (const statement of [select, update, remove]) await client.query(statement)
      // DEFAULT VALUES fails on a NOT NULL column, after the grant let it through.
      expect(await refusal(client.query(insert))).toMatch(/null value/)
    })
    await asLogin('retention', async (client) => {
      for (const statement of [select, update, remove]) await client.query(statement)
      expect(await refusal(client.query(insert)), table).toMatch(/permission denied/)
    })
    await asLogin('auth_app', async (client) => {
      expect(await refusal(client.query(select)), table).toMatch(/permission denied/)
    })
  }
})

test('finds an organisation by slug or ID with the account’s role, and no role for others', async () => {
  const org = await makeOrganization()
  const user = await makeUser()
  await makeMember({ organizationId: org.id, userId: user.id, role: 'approver' })
  const stranger = await makeUser()
  const outsider = await makeUser()
  // Better Auth's default role isn't one of #79 §1's, so it grants nothing.
  await makeMember({ organizationId: org.id, userId: outsider.id, role: 'member' })
  const find = (ref: string, accountId: string | null) => withSystem('test', (tx) => findMembership(tx, ref, accountId))

  expect(await find(org.slug, user.id)).toEqual({ id: org.id, slug: org.slug, role: 'approver' })
  expect(await find(org.id, user.id)).toEqual({ id: org.id, slug: org.slug, role: 'approver' })
  expect(await find(org.slug, stranger.id)).toEqual({ id: org.id, slug: org.slug, role: null })
  expect(await find(org.slug, outsider.id)).toEqual({ id: org.id, slug: org.slug, role: null })
  expect(await find(org.slug, null)).toEqual({ id: org.id, slug: org.slug, role: null })
  expect(await find('no-such-organisation', user.id)).toBeNull()
  expect(await find(randomUUID(), user.id)).toBeNull()
})
