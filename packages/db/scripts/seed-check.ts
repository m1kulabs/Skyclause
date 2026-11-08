// `bun run db:seed-check` (after `bun run db:up`): fails if migrating an empty database leaves rows in a seed table.
import { seedCheck } from './seeds'

const { counts, problems } = await seedCheck()
for (const [table, n] of Object.entries(counts)) console.log(`${table}: ${n} rows`)
for (const problem of problems) console.error(`seed-check: ${problem}`)
console.log(problems.length ? 'seed-check failed' : 'seed-check passed: no seeds')
process.exitCode = problems.length ? 1 : 0
