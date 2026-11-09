// #163 (c-recipient-replies): `crowd_reply` and `plan_feedback` on the #79 §7 test database.
import { expect, test } from 'vitest'
import { issueSubscriberToken, systemPrincipal, withTenant } from '../src'
import { makeOrganization, makeSubscriber, makeWindow } from './factories'
import { asLogin, refusal } from './harness'

test('ANL-7: plan_feedback holds counts only, with no text column for free text', async () => {
  const columns = await asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'plan_feedback' ORDER BY column_name`
    )
    return rows
  })
  expect(columns.map((c) => c.column_name)).toEqual([
    'answer',
    'count',
    'created_at',
    'id',
    'org_id',
    'project_id',
    'window_id'
  ])
  expect(columns.filter((c) => ['text', 'character varying', 'json', 'jsonb'].includes(c.data_type))).toEqual([])
})

test('a reply token can’t name another organisation’s window, so a reply always lands in its own organisation', async () => {
  const [acme, other] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const theirs = await withTenant({ orgId: other, principal: systemPrincipal('test') }, (tx) => makeWindow(tx))
  const minted = withTenant({ orgId: acme, principal: systemPrincipal('test') }, async (tx) => {
    const subscriber = await makeSubscriber(tx)
    return issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: 'reply', windowId: theirs.id })
  })
  expect(await refusal(minted)).toMatch(/subscriber_token_window/)
})
