// Checks against the deployed pilot web app, run by the pilot-deploy and pilot-canary workflows.
import type { Health, SourceHealth } from './src/health.ts'

// `doGet?health=1` through the `/exec` URL, which redirects to the script's content host.
export async function fetchHealth(
  ingestUrl: string,
  fetchFn: (url: string) => Promise<Response> = fetch
): Promise<Health> {
  const response = await fetchFn(`${ingestUrl}?health=1`)
  const text = await response.text()
  if (!response.ok) throw new Error(`health returned HTTP ${response.status}`)
  let body: { ok?: unknown; error?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`health returned a body that isn't JSON: ${text.slice(0, 200)}`)
  }
  if (body.ok !== true) throw new Error(`health failed: ${String(body.error)}`)
  return body as Health
}

function scopesOf(manifest: string): Set<string> {
  return new Set((JSON.parse(manifest) as { oauthScopes?: string[] }).oauthScopes ?? [])
}

interface ScopeGuardDeps {
  health: () => Promise<Health>
  manifestAt: (sha: string) => Promise<string>
  nextManifest: string
}

// Triggers run the pushed code at once, so a changed scope list fails them until the pilot owner consents again.
// Returns why the deploy must stop, or null.
export async function scopeGuard({ health, manifestAt, nextManifest }: ScopeGuardDeps): Promise<string | null> {
  const remedy = 'check the scopes by hand, then dispatch pilot-deploy with scopes_reauthorized'
  let sha: string
  let deployedManifest: string
  try {
    sha = (await health()).sha
  } catch (error) {
    return `${(error as Error).message}; ${remedy}`
  }
  try {
    deployedManifest = await manifestAt(sha)
  } catch {
    return `the deployed SHA ${sha} isn't in this checkout; ${remedy}`
  }
  const deployed = scopesOf(deployedManifest)
  const next = scopesOf(nextManifest)
  const added = [...next].filter((scope) => !deployed.has(scope))
  const removed = [...deployed].filter((scope) => !next.has(scope))
  if (added.length === 0 && removed.length === 0) return null
  const changes = [added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`]
  return (
    `oauthScopes changed: ${changes.filter(Boolean).join('; ')}. Triggers fail until the pilot owner grants them: ` +
    'dispatch pilot-deploy with scopes_reauthorized, then the owner runs setup() in the Apps Script editor straight away.'
  )
}

// The canary's rule: a source with a threshold is stale past it, or when it has never had a successful poll.
// `off_hours` (the camera outside CAMERA_DAY_START–CAMERA_DAY_END, 07:15–19:00 MYT by default) isn't silence.
export function staleSources(health: Health): SourceHealth[] {
  return health.sources.filter(
    (source) =>
      source.state !== 'off_hours' &&
      source.stale_after_min !== null &&
      (source.age_min === null || source.age_min > source.stale_after_min)
  )
}

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

async function main(verb: string | undefined, sha: string | undefined) {
  const ingestUrl = process.env.INGEST_URL || fail('INGEST_URL is not set; run pilot/wizard.sh')
  if (verb === 'scope-guard') {
    const problem = await scopeGuard({
      health: () => fetchHealth(ingestUrl),
      manifestAt: (deployedSha) => Bun.$`git show ${deployedSha}:pilot/apps-script/appsscript.json`.quiet().text(),
      nextManifest: await Bun.file(`${import.meta.dir}/appsscript.json`).text()
    })
    if (problem) fail(problem)
    console.log('oauthScopes match the deployed SHA')
  } else if (verb === 'await-sha' && sha) {
    // The web app can serve the previous version for a moment after update-deployment.
    let lastProblem = ''
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const health = await fetchHealth(ingestUrl)
        if (health.sha === sha) return console.log(JSON.stringify(health, null, 2))
        lastProblem = `health reports ${health.sha}`
      } catch (error) {
        lastProblem = (error as Error).message
      }
      await Bun.sleep(15_000)
    }
    fail(`health never reported ${sha}: ${lastProblem}`)
  } else if (verb === 'canary') {
    const health = await fetchHealth(ingestUrl).catch((error) => fail(error.message))
    console.log(JSON.stringify(health, null, 2))
    const stale = staleSources(health)
    for (const source of stale) {
      const age = source.age_min === null ? 'no successful poll' : `${source.age_min} min old`
      console.error(`::error::${source.source_id} is ${age}, past stale_after_min ${source.stale_after_min}`)
    }
    if (stale.length) process.exit(1)
  } else {
    fail('usage: bun pilot/apps-script/deployed.ts scope-guard | await-sha <sha> | canary')
  }
}

if (import.meta.main) await main(process.argv[2], process.argv[3])
