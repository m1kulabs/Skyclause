import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { seedCheck, seedScripts } from '../scripts/seeds'
import { migrationsWith } from './harness'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

test('db:seed-check fails on a workflow running another job or a package seed script, and passes on main', () => {
  expect(seedScripts()).toEqual([])
  const root = mkdtempSync(join(tmpdir(), 'skyclause-seeds-'))
  for (const dir of ['.github/workflows', 'apps/web', 'packages/db']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(
    join(root, '.github/workflows/deploy.yml'),
    'run: |\n  gcloud run jobs execute migrate --wait\n  gcloud run jobs execute demo-data --wait\n'
  )
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'db:seed-check': 'x' } }))
  writeFileSync(join(root, 'packages/db/package.json'), JSON.stringify({ scripts: { 'db:seed': 'bun seed.ts' } }))
  expect(seedScripts(root)).toEqual([
    '.github/workflows/deploy.yml executes job demo-data, which may seed',
    'packages/db/package.json has a seed script, db:seed'
  ])
})
