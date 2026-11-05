// Run by `bun run lint`: fails on any spec §1 or D10 dependency violation (see boundaries.ts).
import { checkBoundaries } from './boundaries'

const problems = checkBoundaries(process.cwd())
for (const problem of problems) console.error(problem)
process.exitCode = problems.length ? 1 : 0
