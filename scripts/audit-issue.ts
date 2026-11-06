// `audit-issue.ts <audit.json>` (#249): reads `bun audit --production --json`. With advisories it opens, or updates,
// the one open devops issue listing them (through `gh`) and fails. Output that isn't its advisory map means bun audit
// itself failed, which exits 2 without touching an issue.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

interface Advisory {
  url: string
  title: string
  severity: string
  vulnerable_versions: string
}

const TITLE = 'fix: patch production dependency advisories'

const file = process.argv[2]
if (!file) {
  console.error('usage: audit-issue.ts <audit.json>')
  process.exit(2)
}

let audit: Record<string, Advisory[]>
try {
  audit = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof audit !== 'object' || audit === null || !Object.values(audit).every(Array.isArray)) throw new Error()
} catch {
  console.error("bun audit didn't print its advisory JSON, so it failed before checking anything (its error is above)")
  process.exit(2)
}

const lines = Object.entries(audit).flatMap(([name, advisories]) =>
  advisories.map((a) => `- \`${name}\`, ${a.severity}, \`${a.vulnerable_versions}\`: [${a.title}](${a.url})`)
)
if (lines.length === 0) {
  console.log('No advisories in production dependencies.')
  process.exit(0)
}

const body = `\`bun audit --production\` on \`main\` reports advisories in production dependencies (#249). TRD Security: \
patches land within 7 days, out-of-band ones within 48 hours.

${lines.join('\n')}

Bump each package past its vulnerable range (\`bun audit fix\` shows how) and merge, which deploys. If no fix exists \
yet, say so here and add \`--ignore=<GHSA>\` to the audit step in \`.github/workflows/audit.yml\` until one does.
`
console.error(lines.join('\n'))

function gh(args: string[], input?: string) {
  const result = spawnSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] })
  if (result.status !== 0) {
    console.error(`gh ${args.join(' ')} failed`)
    process.exit(2)
  }
  return result.stdout
}

// The label scopes the list; GitHub's search index can lag a just-created issue, so it isn't used.
const open = JSON.parse(
  gh(['issue', 'list', '--state', 'open', '--label', 'devops', '--limit', '200', '--json', 'number,title,body'])
) as { number: number; title: string; body: string }[]
const issue = open.find((candidate) => candidate.title === TITLE)
if (!issue) {
  gh(['issue', 'create', '--title', TITLE, '--label', 'devops', '--assignee', 'kymil4', '--body-file', '-'], body)
} else if (issue.body.replace(/\r\n/g, '\n').trim() !== body.trim()) {
  gh(['issue', 'edit', String(issue.number), '--body-file', '-'], body)
  gh(['issue', 'comment', String(issue.number), '--body-file', '-'], `The advisories changed: ${process.env.RUN_URL}`)
}
process.exit(1)
