import { expect, test } from 'vitest'
import { asLogin, refusal } from './harness'
test('observation heads enforce private system/retention RLS and carry no reading values', async () => {
  const state = await asLogin('postgres', (client) =>
    client.query(
      "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname='source_observation_head'"
    )
  )
  expect(state.rows).toEqual([{ enabled: true, forced: true }])
  for (const role of ['app', 'public_reader', 'auth_app'])
    await asLogin(role === 'public_reader' ? 'app' : (role as 'app' | 'auth_app'), async (client) => {
      if (role === 'public_reader') await client.query('SET ROLE public_reader')
      expect(await refusal(client.query('SELECT * FROM public.source_observation_head'))).toMatch(/permission denied/)
    })
  for (const role of ['system', 'retention'] as const)
    await asLogin(role, async (client) => {
      await client.query('SELECT * FROM public.source_observation_head')
      await client.query('UPDATE public.source_observation_head SET captured_at=captured_at WHERE false')
      await client.query('DELETE FROM public.source_observation_head WHERE false')
    })
  const columns = await asLogin('postgres', (client) =>
    client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='source_observation_head' ORDER BY ordinal_position"
    )
  )
  expect(columns.rows.map((row) => row.column_name)).toEqual([
    'source_id',
    'metric',
    'observed_at',
    'item_key',
    'captured_at'
  ])
})
