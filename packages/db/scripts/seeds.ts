// The NFR-15 seed check (#79 §7, D4, D9): migrate an empty database exactly as the deploy's `migrate` job does, then
// count rows, as the superuser (which RLS never hides rows from), in each listed table the live schema has, so #92's
// tables join it. catalogue-sync and commons:provision run after `migrate` on a deploy, never inside it.
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
