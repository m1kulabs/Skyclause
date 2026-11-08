import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { seedCheck } from '../scripts/seeds'
import { migrationsWith } from './harness'

test('db:seed-check passes on the repository’s migrations', () => {
  const script = fileURLToPath(new URL('../scripts/seed-check.ts', import.meta.url))
  const run = spawnSync('bun', [script], { encoding: 'utf8' })
  expect(run.status, run.stderr).toBe(0)
  expect(run.stdout).toMatch(/public\.project: 0 rows/)
  expect(run.stdout).toMatch(/seed-check passed/)
}, 30_000)

test('db:seed-check fails on a migration that inserts a project, naming the tables', async () => {
  const orgId = '019a6000-0000-7000-8000-000000000001'
  const seeding = migrationsWith(
    '0003_test-seed',
    `INSERT INTO auth.organization (id, name, slug, created_at) VALUES ('${orgId}', 'Seeded', 'seeded', now());
SELECT set_config('app.org_id', '${orgId}', true);
INSERT INTO project (org_id, slug, name, time_zone) VALUES ('${orgId}', 'seeded', 'Seeded', 'Asia/Kuala_Lumpur');
`
  )
  const { problems } = await seedCheck(seeding)
  expect(problems).toEqual([
    'auth.organization has 1 rows after migrating an empty database (NFR-15: no seeds)',
    'public.project has 1 rows after migrating an empty database (NFR-15: no seeds)'
  ])
})
