// `bun run flag:set <key> on|off [--org <id>]`, `--org` for `pack_crowd` only (#79 §6): the only way a feature flag changes, audited as system job
// `flag:set`. Connects as DATABASE_URL_SYSTEM, else the local container's `system` login (`bun run db:up`).
import { closeConnections, FEATURE_FLAGS, setFlag, type FeatureFlagKey } from '../src'
import { localUrl } from './local'

const USAGE = `usage: flag:set <${Object.keys(FEATURE_FLAGS).join('|')}> on|off [--org <organisation id>]`

function parse([key, state, ...rest]: string[]) {
  const org = rest[0] === '--org' && rest.length === 2 ? rest[1] : undefined
  if (!Object.hasOwn(FEATURE_FLAGS, key ?? '') || !['on', 'off'].includes(state ?? '') || (rest.length && !org)) {
    throw new Error(USAGE)
  }
  return { key: key as FeatureFlagKey, enabled: state === 'on', orgId: org }
}

process.env.DATABASE_URL_SYSTEM ??= localUrl('system')
try {
  const flag = parse(process.argv.slice(2))
  await setFlag(flag)
  console.log(
    `${flag.key} ${flag.enabled ? 'on' : 'off'} ${flag.orgId ? `for organisation ${flag.orgId}` : 'globally'}`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await closeConnections()
}
