// `bun scripts/cloudflare-record.ts [--dry-run] <A|AAAA|CNAME|TXT|MX> <name> <content>`: creates or updates one
// record under skyclause.m1ku.tech with M1KU_CLOUDFLARE_API_TOKEN, by the rules in cloudflare-dns.ts.
import { upsertRecord } from './cloudflare-dns'

const args = process.argv.slice(2)
const dryRun = args[0] === '--dry-run'
const [type, name, content] = dryRun ? args.slice(1) : args
const token = process.env.M1KU_CLOUDFLARE_API_TOKEN

if (
  (type !== 'A' && type !== 'AAAA' && type !== 'CNAME' && type !== 'TXT' && type !== 'MX') ||
  !name ||
  content === undefined ||
  args.length !== (dryRun ? 4 : 3)
) {
  console.error(
    'usage: cloudflare-record.ts [--dry-run] <A|AAAA|CNAME|TXT|MX> <name> <content>; MX content is "<priority> <host>"'
  )
  process.exit(2)
}
if (!token) {
  console.error('M1KU_CLOUDFLARE_API_TOKEN is not set')
  process.exit(2)
}

try {
  const result = await upsertRecord({ type, name, content }, { token, dryRun })
  console.log(
    `${dryRun ? 'dry run: would be ' : ''}${result.action} ${type} ${name}${result.id ? ` (${result.id})` : ''}`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
