// The NFR-15 seed check (#79 §7, D4, D9). Migrations: migrate an empty database exactly as the deploy's `migrate` job
// does, then count rows, as the superuser (which RLS never hides rows from), in each listed table the live schema has,
// so #92's tables join it. Scripts: a workflow may execute only the deploy's own jobs and D4's exceptions, and no
// package script may be a seed script.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from '../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder, scratchName, withLocal } from './local'

/** Organisations, members, projects, windows, polls, readings, runs, bundles, calls, ledger entries and grades. */
const SEED_TABLES = [
  'organization',
  'member',
  'project',
  'window',
  'poll',
  'reading',
  'run',
  'bundle',
  'call',
  'ledger_entry',
  'grade'
]
/** Tables this ticket creates, so a renamed or dropped one can't make the check pass vacuously. */
const ALWAYS = ['organization', 'member', 'project']

export async function seedCheck(folder = migrationsFolder) {
  const database = scratchName('skyclause_seed')
  await createDatabase(database)
  try {
    await migrate(localUrl('migrator', database), folder)
    return await withLocal('postgres', database, async (client) => {
      const { rows: tables } = await client.query<{ schema: string; name: string }>(
        `SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND c.relname = ANY($1) ORDER BY 2`,
        [SEED_TABLES]
      )
      const problems = ALWAYS.filter((name) => !tables.some((table) => table.name === name)).map(
        (name) => `${name} is missing from the migrated schema`
      )
      const counts: Record<string, number> = {}
      for (const { schema, name } of tables) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "${schema}"."${name}"`)
        const n = Number(rows[0]!.n)
        counts[`${schema}.${name}`] = n
        if (n > 0) problems.push(`${schema}.${name} has ${n} rows after migrating an empty database (NFR-15: no seeds)`)
      }
      return { counts, problems }
    })
  } finally {
    await dropDatabase(database)
  }
}

/** Cloud Run jobs a workflow may execute: the migrations, and catalogue-sync and commons:provision (D4). */
const ALLOWED_JOBS = ['migrate', 'catalogue-sync', 'commons-provision']

/** Workflow steps that run a job outside ALLOWED_JOBS, and package scripts named for seeding. */
export function seedScripts(root = fileURLToPath(new URL('../../..', import.meta.url))) {
  const problems: string[] = []
  const workflows = join(root, '.github/workflows')
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    for (const [, job] of readFileSync(join(workflows, file), 'utf8').matchAll(/gcloud run jobs execute (\S+)/g))
      if (!ALLOWED_JOBS.includes(job!)) problems.push(`.github/workflows/${file} executes job ${job}, which may seed`)
  }
  const manifests = ['apps', 'packages']
    .flatMap((group) => readdirSync(join(root, group)).map((name) => `${group}/${name}/package.json`))
    .concat('package.json')
    .filter((manifest) => existsSync(join(root, manifest)))
  for (const manifest of manifests) {
    const { scripts = {} } = JSON.parse(readFileSync(join(root, manifest), 'utf8')) as {
      scripts?: Record<string, string>
    }
    for (const name of Object.keys(scripts))
      if (/seed/i.test(name) && name !== 'db:seed-check') problems.push(`${manifest} has a seed script, ${name}`)
  }
  return problems
}
