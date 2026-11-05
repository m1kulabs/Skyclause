// Stub for a §7 command whose owner hasn't landed: `not-configured.ts <owner> <file suffix> <dir...>`.
// Passes, printing `not configured: <owner>`, only while no file it would check exists.
import { listFiles } from './files'

const [owner, suffix, ...dirs] = process.argv.slice(2)
if (!owner || !suffix || dirs.length === 0) {
  console.error('usage: not-configured.ts <owner> <file suffix> <dir...>')
  process.exit(2)
}

const found = listFiles(process.cwd(), dirs).filter((file) => file.endsWith(suffix))
if (found.length > 0) {
  console.error(`${found.join(', ')} exists, but this command is still a stub: ${owner} must replace it`)
  process.exit(1)
}
console.log(`not configured: ${owner}`)
