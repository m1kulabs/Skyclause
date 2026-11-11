import { spawnSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const wizardPath = fileURLToPath(new URL('../infra/wizards/production-pilot.sh', import.meta.url))
const templatePath = fileURLToPath(new URL('../.agents/skills/wizard/template.sh', import.meta.url))

// Stand-ins for every tool that could reach a real cloud or GitHub. Each answers only the calls a test lists in
// $FAKE_STATE/<tool>.routes (first matching glob wins), logs every call, and records any other call in
// $FAKE_STATE/unexpected, which fails the test. terraform, gh, bun and aws get no routes, so any call to them fails.
// Each also records an API key that reaches its environment, which fails the test too.
const keyInEnv = `[[ -z "\${SKYCLAUSE_API_KEY:-}\${RESEND_FULL_ACCESS_KEY:-}" ]] || printf '%s: %s\\n' "$(basename "$0")" "\${SKYCLAUSE_API_KEY:-}\${RESEND_FULL_ACCESS_KEY:-}" >> "$FAKE_STATE/key-in-env"`
const fakeCli = `#!/usr/bin/env bash
${keyInEnv}
name="$(basename "$0")"
printf '%s\\n' "$*" >> "$FAKE_STATE/$name.calls"
while IFS=$'\\t' read -r pattern code out err; do
  if [[ "$*" == $pattern ]]; then
    cat "$out"
    cat "$err" >&2
    exit "$code"
  fi
done < "$FAKE_STATE/$name.routes"
printf '%s %s\\n' "$name" "$*" >> "$FAKE_STATE/unexpected"
exit 97
`

// curl answers by URL; a write flag, in any spelling, is never expected.
const fakeCurl = `#!/usr/bin/env bash
${keyInEnv}
printf '%q ' "$@" >> "$FAKE_STATE/curl.calls"
printf '\\n' >> "$FAKE_STATE/curl.calls"
url="\${!#}"
with_code=no
for arg in "$@"; do
  if [[ "$arg" =~ ^-[A-Za-z]*[XdFT] || "$arg" =~ ^--(request|data|form|upload-file|json) ]]; then
    printf 'curl %s\\n' "$*" >> "$FAKE_STATE/unexpected"
    exit 97
  fi
  case "$arg" in
    -K) cat >> "$FAKE_STATE/curl.stdin"; printf '\\n' >> "$FAKE_STATE/curl.stdin" ;;
    *http_code*) with_code=yes ;;
  esac
done
while IFS=$'\\t' read -r pattern code body; do
  [[ "$url" == $pattern ]] || continue
  if [[ "$with_code" == yes ]]; then
    cat "$body"
    printf '\\n%s' "$code"
    exit 0
  fi
  if [[ "$code" != 2* ]]; then
    echo "curl: (22) The requested URL returned error: $code" >&2
    exit 22
  fi
  cat "$body"
  exit 0
done < "$FAKE_STATE/curl.routes"
printf 'curl %s\\n' "$*" >> "$FAKE_STATE/unexpected"
exit 97
`

type Reply = { status: number; body: string }
type CliReply = { exit?: number; stdout?: string; stderr?: string }

const json = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) })
const notBuilt = (owner: string) =>
  json(501, {
    owner,
    type: 'https://docs.skyclause.m1ku.tech/problems/not-built',
    title: 'Not built',
    status: 501,
    detail: `${owner} has not built this operation yet.`
  })

const PROJECT_ID = '019a7000-0000-7000-8000-000000000001'
const project = {
  id: PROJECT_ID,
  slug: 'bukit-jalil',
  name: 'Bukit Jalil',
  packs: [{ pack: 'sky', enabled: true, sheet_id: '019a7000-0000-7000-8000-000000000002', schedule: null, sla_s: 600 }],
  summary: { next_action: 'bind_source' }
}
const ledgerVerify = {
  valid: true,
  checked_entries: 0,
  first_bad_entry_id: null,
  head_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  verified_at: '2026-11-11T03:30:00Z'
}
const subscriberCounts = (confirmed: number) => ({
  total: confirmed,
  confirmed,
  unconfirmed: 0,
  suppressed: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  by_window: [],
  by_channel: [{ channel: 'email', count: confirmed }]
})

// Production as it answers on 11 November 2026, for a read key.
function production(overrides: Record<string, Reply> = {}): Record<string, Reply> {
  return {
    '*/health': { status: 200, body: 'ok' },
    '*/v1/projects?slug=*include=summary': json(200, { data: [project], next_cursor: null }),
    // The last stage's check that the key is revoked.
    '*/v1/projects?limit=1': json(401, {
      type: 'https://docs.skyclause.m1ku.tech/problems/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'The API key is revoked.'
    }),
    '*/v1/projects/*/clause-sheets': json(200, {
      data: [{ id: '019a7000-0000-7000-8000-000000000002', pack: 'sky', live_version: { n: 1, status: 'published' } }]
    }),
    '*/v1/projects/*/ledger/verify': json(200, ledgerVerify),
    '*/v1/projects/*/pilot-archive': json(200, { data: [], next_cursor: null, label: 'pilot' }),
    '*/v1/catalogue/sources': notBuilt('b-source-binding'),
    '*/v1/projects/*/windows': notBuilt('b-windows-api'),
    '*/v1/projects/*/subscriber-counts': json(200, subscriberCounts(2)),
    // listWebhooks needs integrations.manage, which a read key lacks; the auth gate answers before not-built.
    '*/v1/webhooks': json(403, {
      type: 'https://docs.skyclause.m1ku.tech/problems/insufficient-scope',
      title: 'Insufficient scope',
      status: 403,
      detail: 'This key lacks integrations.manage.'
    }),
    '*/v1/projects/*/calls?state=sent&limit=1': json(200, { data: [], next_cursor: null }),
    '*/v1/projects/*/ledger?kind=crowd_reply': json(200, { data: [], next_cursor: null, total: 0 }),
    // Resend as infra/wizards/resend.sh leaves it: both domains verified, and the one webhook enabled with its five events.
    '*/domains?limit=100': json(200, resendDomains()),
    '*/webhooks?limit=100': json(200, resendWebhooks()),
    '*/p/*/*/calendar.ics': {
      status: 200,
      body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:call-1@skyclause.m1ku.tech\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    },
    ...overrides
  }
}

const resendKey = 're_pilotcheck_0123456789abcdef'
const RESEND_EVENTS = ['email.delivered', 'email.bounced', 'email.complained', 'email.suppressed', 'email.received']
const resendDomain = (name: string, status: string) => ({
  id: `4dd369bc-aa82-4ff3-97de-${name.length.toString().padStart(12, '0')}`,
  name,
  status,
  created_at: '2026-11-11 08:00:00.000000+00',
  region: 'ap-northeast-1',
  open_tracking: false,
  click_tracking: false,
  capabilities: {
    sending: name.startsWith('notices.') ? 'enabled' : 'disabled',
    receiving: name.startsWith('in.') ? 'enabled' : 'disabled'
  }
})
function resendDomains(statuses: { notices?: string; in?: string } = {}) {
  return {
    object: 'list',
    has_more: false,
    data: [
      resendDomain('notices.skyclause.m1ku.tech', statuses.notices ?? 'verified'),
      resendDomain('in.skyclause.m1ku.tech', statuses.in ?? 'verified')
    ]
  }
}
const resendWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: '4dd369bc-aa82-4ff3-97de-514ae3000ee0',
  endpoint: 'https://worker-413187272599.asia-southeast1.run.app/resend/webhook',
  events: RESEND_EVENTS,
  status: 'enabled',
  created_at: '2026-11-11T08:00:00.000Z',
  ...overrides
})
function resendWebhooks(hooks: object[] = [resendWebhook()]) {
  return { object: 'list', has_more: false, data: hooks }
}

function gcloud(overrides: Record<string, CliReply> = {}): Record<string, CliReply> {
  return {
    'run jobs list *': { stdout: '' },
    ...overrides
  }
}

// The run's PATH is the stand-ins plus links to these utilities, so no other tool on this machine is reachable.
const SYSTEM_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
const UTILITIES = [
  'bash',
  'python3',
  'cat',
  'grep',
  'mktemp',
  'rm',
  'date',
  'dirname',
  'basename',
  'tail',
  'shasum',
  'awk'
]

function systemTool(name: string) {
  const dir = SYSTEM_DIRS.find((candidate) => existsSync(join(candidate, name)))
  if (!dir) throw new Error(`${name} is needed to run the wizard's tests`)
  return realpathSync(join(dir, name))
}

function runWizard(options: {
  input: string[]
  curl?: Record<string, Reply>
  gcloud?: Record<string, CliReply>
  existingEnvFile?: string
  env?: Record<string, string>
}) {
  const fakeOpen = `#!/usr/bin/env bash\n${keyInEnv}\nprintf '%s\\n' "$*" >> "$FAKE_STATE/open.calls"\n`
  const dir = plantRepo({ 'bin/curl': fakeCurl, 'bin/open': fakeOpen })
  const bin = join(dir, 'bin')
  for (const tool of ['gcloud', 'aws', 'terraform', 'gh', 'bun']) writeFileSync(join(bin, tool), fakeCli)
  for (const tool of ['curl', 'open', 'gcloud', 'aws', 'terraform', 'gh', 'bun']) chmodSync(join(bin, tool), 0o755)
  for (const tool of UTILITIES) symlinkSync(systemTool(tool), join(bin, tool))
  const state = join(dir, 'state')
  mkdirSync(join(state, 'replies'), { recursive: true })
  let n = 0
  const reply = (content: string) => {
    const path = join(state, 'replies', String(n++))
    writeFileSync(path, content)
    return path
  }
  const routes = (tool: string, lines: string[]) =>
    writeFileSync(join(state, `${tool}.routes`), lines.map((line) => `${line}\n`).join(''))
  routes(
    'curl',
    Object.entries(options.curl ?? production()).map(([glob, r]) => `${glob}\t${r.status}\t${reply(r.body)}`)
  )
  routes(
    'gcloud',
    Object.entries(options.gcloud ?? gcloud()).map(
      ([glob, r]) => `${glob}\t${r.exit ?? 0}\t${reply(r.stdout ?? '')}\t${reply(r.stderr ?? '')}`
    )
  )
  for (const tool of ['aws', 'terraform', 'gh', 'bun']) routes(tool, [])

  const envFile = join(dir, 'wizard.env')
  const evidenceFile = join(dir, 'production-pilot.evidence.md')
  if (options.existingEnvFile) writeFileSync(envFile, options.existingEnvFile, { mode: 0o600 })

  // Only what bash and python3 need; no credential reaches the run, and HOME holds no CLI configuration.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['LANG', 'LC_ALL'].includes(key)))
  const result = spawnSync(join(bin, 'bash'), [wizardPath], {
    cwd: repoRoot,
    input: `${options.input.join('\n')}\n`,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...inherited,
      ...options.env,
      PATH: bin,
      HOME: dir,
      FAKE_STATE: state,
      ENV_FILE: envFile,
      EVIDENCE_FILE: evidenceFile
    }
  })

  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const calls = {
    curl: read(join(state, 'curl.calls')),
    curlStdin: read(join(state, 'curl.stdin')),
    gcloud: read(join(state, 'gcloud.calls')),
    open: read(join(state, 'open.calls'))
  }
  expect(result.error, 'the run timed out or could not start').toBeUndefined()
  expect(read(join(state, 'unexpected')), 'a call no stand-in answers').toBe('')
  expect(read(join(state, 'key-in-env')), 'an API key in a child process environment').toBe('')
  expect(result.stderr, 'a shell error').not.toMatch(/command not found|unbound variable|syntax error/)
  expectOnlyReads(calls)
  return {
    result,
    output: result.stdout + result.stderr,
    envContent: read(envFile),
    evidenceContent: read(evidenceFile),
    calls
  }
}

const secretKey = 'skc_live_9876543210abcdefSECRETVALUE'
// The creation line logs the new key's id, then the key; the person pastes that line.
const keyId = 'k7Qm2xTzR9aLpW4nVb8cYd3eFg6hJ1sU'
const keyLine = `${keyId} ${secretKey}`

// Every remote call is a read: GETs to production hosts (the key only to the API) and to Resend's domain and webhook
// lists (its key only there), and list reads in gcloud. No argv carries a key, and curl's stdin config only ever adds
// headers.
function expectOnlyReads(calls: { curl: string; curlStdin: string; gcloud: string; open: string }) {
  for (const line of calls.gcloud.trim().split('\n').filter(Boolean)) {
    expect(line).toMatch(/^(run jobs list|run jobs executions list) /)
  }
  for (const line of calls.curl.trim().split('\n').filter(Boolean)) {
    expect(line).toMatch(
      / (https:\/\/(api\.|app\.)?skyclause\.m1ku\.tech\/\S*|https:\/\/api\.resend\.com\/(domains|webhooks)\\\?limit=100) ?$/
    )
    if (line.includes(' -K - ')) {
      expect(line).toMatch(/ (https:\/\/api\.skyclause\.m1ku\.tech\/\S*|https:\/\/api\.resend\.com\/\S*) ?$/)
    }
  }
  for (const log of [calls.curl, calls.gcloud, calls.open]) expect(log).not.toMatch(/skc_|re_pilotcheck/)
  for (const line of calls.curlStdin.split('\n').filter(Boolean)) expect(line).toMatch(/^header = "[^"]*"$/)
}

describe('infra/wizards/production-pilot.sh static invariants', () => {
  test('copies the /wizard library verbatim, is executable, passes bash -n and shellcheck, and git-ignores its evidence file', () => {
    accessSync(wizardPath, constants.X_OK)
    const wizard = readFileSync(wizardPath, 'utf8')
    const template = readFileSync(templatePath, 'utf8')

    const marker = '# STAGES:'
    expect(wizard.indexOf(marker)).toBeGreaterThan(0)
    expect(wizard.slice(0, wizard.indexOf(marker))).toBe(template.slice(0, template.indexOf(marker)))

    const stagesSection = wizard.slice(wizard.indexOf('run_wizard() {'))
    const declaredTotal = Number(stagesSection.match(/^\s*TOTAL_STAGES=(\d+)/m)?.[1] ?? 0)
    const stageCalls = [...stagesSection.matchAll(/^\s*stage\s+"/gm)].length
    expect(declaredTotal).toBeGreaterThan(0)
    expect(stageCalls).toBe(declaredTotal)

    // Never persist the API key or email addresses to ENV_FILE.
    expect(stagesSection).not.toMatch(/write_env\s+(SKYCLAUSE_API_KEY|.*EMAIL)/)
    // Never runs Terraform, GitHub, Bun or another wizard: it only prints them for a person.
    expect(wizard).not.toMatch(/^\s*(terraform|gh|bun)\s/m)
    expect(wizard).not.toMatch(/^\s*\.\/infra\/wizards\//m)
    // Every gcloud command it runs, on any path, is a read, and it needs no AWS CLI; messages to the person are left out.
    const commands = wizard
      .slice(wizard.indexOf(marker))
      .split('\n')
      .filter((line) => !/^\s*(#|warn|note|say|step|SKIPPED|for tool in)/.test(line))
      .join('\n')
    const cloudCalls = [...commands.matchAll(/\b(gcloud) ([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*){0,3})/g)]
    expect(cloudCalls.length).toBeGreaterThan(0)
    expect(commands).not.toMatch(/\b(terraform|gh|bun|aws)\b/)
    expect(commands, 'a flag before the subcommand hides it from this check').not.toMatch(/\bgcloud +-/)
    for (const [call] of cloudCalls) {
      expect(call).toMatch(/^gcloud (run jobs list|run jobs executions list)/)
    }
    // Every Resend call is a GET: curl never gets a request method or a body, and nothing names the retired SES wizard.
    expect(commands).not.toMatch(/ -X | --data| -d |amazonaws|staff-and-ses/)

    const bashCheck = spawnSync('bash', ['-n', wizardPath], { cwd: repoRoot, encoding: 'utf8' })
    expect(bashCheck.status, bashCheck.stderr).toBe(0)

    // CI's shellcheck 0.9.0 reports SC2317 (info, "unreachable") for the library's functions, which are
    // called through the stage runner and traps; 0.11 doesn't. Every other code must be clean.
    const shellcheck = spawnSync('shellcheck', ['--exclude=SC2317', 'infra/wizards/production-pilot.sh'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
    expect(shellcheck.status, shellcheck.stdout + shellcheck.stderr).toBe(0)

    const gitIgnore = spawnSync('git', ['check-ignore', '-q', 'infra/wizards/production-pilot.evidence.md'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
    expect(gitIgnore.status).toBe(0)
  })
})

describe('infra/wizards/production-pilot.sh only reads', () => {
  const allNo = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    keyLine, // read key line: id and key
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'n', // rota saved?
    '', // stage 9
    '', // stage 10
    'n', // webhook registered?
    '', // stage 11
    'n', // Malay sign-off?
    'n' // revoke the key?
  ]
  const allYes = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'y', // open /new?
    '', // created
    keyLine, // read key line: id and key
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'y', // rota saved?
    '', // stage 9
    '', // stage 10
    'y', // webhook registered?
    '', // stage 11
    'y', // Malay sign-off?
    'y', // revoke the key?
    '' // revoked
  ]

  test('answering "n" to every confirmation performs no write of any kind', () => {
    const { result, calls, evidenceContent } = runWizard({ input: allNo })

    expect(result.status, result.stdout + result.stderr).toBe(0)
    // runWizard checks every run only reads; spelled out here for this case.
    expect(calls.gcloud).not.toMatch(/ (add|create|update|delete|access|execute|deploy) /)
    expect(evidenceContent).not.toContain('Approver rota')
    expect(evidenceContent).not.toContain('Malay reader sign-off')
  })

  test('sends the API key to curl only over stdin, never on its command line', () => {
    const { result, calls } = runWizard({ input: allNo })

    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(calls.curl).toContain(' -K - ')
    expect(calls.curl).not.toContain(secretKey)
    expect(calls.curlStdin).toContain(`Authorization: Bearer ${secretKey}`)
  })

  test('verifies both Resend domains and the webhook, printing only what it read', () => {
    const { result, output, calls } = runWizard({ input: allYes, env: { RESEND_FULL_ACCESS_KEY: resendKey } })

    expect(result.status, output).toBe(0)
    expect(output).toContain('✓ verified Resend domain notices.skyclause.m1ku.tech')
    expect(output).toContain('✓ verified Resend domain in.skyclause.m1ku.tech')
    expect(output).toContain(
      '✓ enabled Resend webhook https://worker-413187272599.asia-southeast1.run.app/resend/webhook'
    )
    expect(calls.curl).toContain('https://api.resend.com/domains\\?limit=100')
    expect(calls.curl).toContain('https://api.resend.com/webhooks\\?limit=100')
    expect(output).not.toContain('whsec_')
  })

  test('sends the Resend key to curl only over stdin, and no child process ever holds it', () => {
    const { result, output, calls } = runWizard({ input: allNo, env: { RESEND_FULL_ACCESS_KEY: resendKey } })

    // runWizard fails the run if the key reached any stand-in's environment.
    expect(result.status, output).toBe(0)
    expect(calls.curl).not.toContain(resendKey)
    expect(calls.curlStdin).toContain(`Authorization: Bearer ${resendKey}`)
  })

  test('names an unverified domain and a disabled webhook that lacks an event, and points to the Resend wizard', () => {
    const { result, output } = runWizard({
      input: allYes,
      env: { RESEND_FULL_ACCESS_KEY: resendKey },
      curl: production({
        '*/domains?limit=100': json(200, resendDomains({ in: 'pending' })),
        '*/webhooks?limit=100': json(
          200,
          resendWebhooks([resendWebhook({ status: 'disabled', events: ['email.delivered', 'email.bounced'] })])
        )
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('Resend domain in.skyclause.m1ku.tech is pending, not verified.')
    expect(output).toContain('✓ verified Resend domain notices.skyclause.m1ku.tech')
    expect(output).toContain('is disabled and lacks email.complained,email.received,email.suppressed')
    expect(output).not.toContain('✓ enabled Resend webhook')
    expect(output).toContain('run ./infra/wizards/resend.sh')
  })

  test('reports a domain Resend does not list, and a missing webhook', () => {
    const { result, output } = runWizard({
      input: allYes,
      env: { RESEND_FULL_ACCESS_KEY: resendKey },
      curl: production({
        '*/domains?limit=100': json(200, { object: 'list', has_more: false, data: [] }),
        '*/webhooks?limit=100': json(200, resendWebhooks([]))
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('Resend domain notices.skyclause.m1ku.tech is missing, not verified.')
    expect(output).toContain('Resend has no webhook whose endpoint ends /resend/webhook.')
  })

  test('reports a failed Resend read as a failed read, not as an unverified domain', () => {
    const { result, output } = runWizard({
      input: allYes,
      env: { RESEND_FULL_ACCESS_KEY: resendKey },
      curl: production({
        '*/domains?limit=100': json(401, {
          statusCode: 401,
          message: 'This API key is restricted to only send emails.',
          name: 'restricted_api_key'
        })
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('GET /domains answered HTTP 401')
    expect(output).toContain('restricted_api_key')
    expect(output).not.toContain('not verified')
  })

  test('a webhook list it cannot read stops the run, naming the field and status, never printing the answer', () => {
    // Resend's list carries each webhook's signing secret; this entry lacks the status the wizard reads.
    const signingSecret = 'whsec_pilotListAnswer0123456789abcdefABCD'
    const { result, output, evidenceContent } = runWizard({
      input: allYes,
      env: { RESEND_FULL_ACCESS_KEY: resendKey },
      curl: production({
        '*/webhooks?limit=100': json(
          200,
          resendWebhooks([{ ...resendWebhook({ signing_secret: signingSecret }), status: undefined }])
        )
      })
    })

    expect(result.status, output).not.toBe(0)
    expect(output).toContain("Couldn't read")
    expect(output).toContain('the HTTP 200 answer')
    expect(output).not.toContain(signingSecret)
    expect(evidenceContent).not.toContain(signingSecret)
  })

  test('says so and reads nothing from Resend when no key is exported', () => {
    const { result, output, calls } = runWizard({ input: allYes })

    expect(result.status, output).toBe(0)
    expect(output).toContain("RESEND_FULL_ACCESS_KEY isn't set in this shell")
    expect(calls.curl).not.toContain('api.resend.com')
  })
})

describe('infra/wizards/production-pilot.sh evidence holds no credential', () => {
  const answers = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    keyLine // read key line: id and key
  ]
  const signedUrl =
    'https://storage.googleapis.com/skyclause-production-archive/orgs/019a7000/pilot/sheets_ledger/ab12-ledger.csv' +
    '?X-Goog-Algorithm=GOOG4-RSA-SHA256' +
    '&X-Goog-Credential=skyclause-web%40skyclause.iam.gserviceaccount.com%2F20261117%2Fauto%2Fstorage%2Fgoog4_request' +
    '&X-Goog-Date=20261117T100000Z&X-Goog-Expires=900&X-Goog-SignedHeaders=host' +
    '&X-Goog-Signature=5f2b0c1d9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8'

  test('records each pilot-archive object by kind, sha256 and capture time, never its signed URL', () => {
    const sha256 = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12'
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({
        '*/v1/projects/*/pilot-archive': json(200, {
          data: [
            {
              project_id: PROJECT_ID,
              kind: 'sheets_ledger',
              url: signedUrl,
              sha256,
              captured_at: '2026-11-17T10:00:00Z'
            }
          ],
          next_cursor: null,
          label: 'Pilot archive (Gemini Enterprise, November 2026)'
        })
      })
    })

    expect(result.status, output).toBe(0)
    expect(evidenceContent).toContain(`kind=sheets_ledger sha256=${sha256} captured_at=2026-11-17T10:00:00Z`)
    expect(evidenceContent).not.toContain('X-Goog-')
    expect(evidenceContent).not.toContain('storage.googleapis.com')
  })

  test.each([
    ['a signed-URL parameter', signedUrl],
    ['a bearer token', 'Authorization: Bearer stand-in-access-token-0123456789'],
    ['a bearer token', 'Bearer abcdefghijklmno'],
    ['an API key', secretKey],
    ['an API key', 'skc_ab12cd34'],
    ['an API key', 're_pilot_0123456789abcdef'], // gitleaks:allow -- a stand-in shaped like a Resend key.
    ['a signing secret', 'whsec_pilotEvidence0123456789abcdefABCD'], // gitleaks:allow -- a stand-in secret.
    ['an email address', 'pilot-tester@example.org'],
    ['an email address', 'owner.call-1@skyclause.m1ku.tech'],
    ['an email address', 'pilot-tester%40example.org'],
    ['an email address', 'call-1@skyclause.m1ku.tech.gmail.com']
  ])('refuses to record a production answer that holds %s', (kind, secret) => {
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({ '*/v1/projects/*/ledger/verify': json(200, { ...ledgerVerify, note: secret }) })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain(`Refused to record #531 evidence: it holds ${kind}`)
    expect(evidenceContent).not.toContain(secret)
    expect(evidenceContent).not.toContain('/ledger/verify')
    // The rest of the run still records what holds no credential.
    expect(evidenceContent).toContain('## #194 — Organisation, project and default Sky clause sheet')
  })
})

describe('infra/wizards/production-pilot.sh environment', () => {
  const answers = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    keyLine // read key line: id and key
  ]

  test('an API key already exported in the shell never reaches a child process', () => {
    const { result, output } = runWizard({
      input: answers,
      env: { SKYCLAUSE_API_KEY: 'skc_exported_0123456789abcdef' }
    })

    expect(result.status, output).toBe(0)
  })

  test('ignores origins set in the environment, so the key only ever goes to production', () => {
    const { result, output } = runWizard({
      input: answers,
      env: {
        API_ORIGIN: 'https://api.example.org',
        APP_ORIGIN: 'https://app.example.org',
        MARKETING_ORIGIN: 'https://example.org'
      }
    })

    expect(result.status, output).toBe(0)
  })

  test('records evidence for a project whose slug starts with sk-', () => {
    const { result, output, evidenceContent } = runWizard({
      input: [...answers.slice(0, 4), 'skyclause-ops', 'sk-bukit-jalil-pilot-site', 'n', keyLine]
    })

    expect(result.status, output).toBe(0)
    expect(evidenceContent).toContain('## #194 — Organisation, project and default Sky clause sheet')
  })
})

describe('infra/wizards/production-pilot.sh reports what still waits, and every failure', () => {
  const answers = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    keyLine, // read key line: id and key
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'y', // rota saved?
    '', // stage 9
    '', // stage 10
    'n', // webhook registered?
    '', // stage 11
    'y', // Malay sign-off?
    'n' // revoke the key?
  ]

  test('names the ticket behind each not-built answer and missing job, and no closed ticket', () => {
    const { result, output, envContent, evidenceContent } = runWizard({ input: answers })

    expect(result.status, output).toBe(0)
    expect(output).toContain('GET /v1/catalogue/sources answers 501 not-built (b-source-binding, #138)')
    expect(output).toContain(`GET /v1/projects/${PROJECT_ID}/windows answers 501 not-built (b-windows-api, #139)`)
    expect(output).toContain('A read key gets 403 from GET /v1/webhooks')
    expect(output).toContain('#193')
    expect(output).toContain('#133')
    expect(output).toContain('Cloud Run has no commons-provision job yet: #179 adds it')
    expect(output).toContain('#210')
    // #113 and #623 are closed: magic-link sign-in works in production.
    expect(output).not.toMatch(/#623|#113\b/)

    expect(output).not.toContain(secretKey)
    expect(envContent).toContain("ORG_SLUG='skyclause-ops'")
    expect(envContent).toContain("PROJECT_SLUG='bukit-jalil'")
    expect(envContent).toContain(`PROJECT_ID='${PROJECT_ID}'`)
    expect(envContent).not.toContain(secretKey)
    expect(evidenceContent).not.toContain(secretKey)
    expect(evidenceContent).toContain('skc_live…')
    expect(evidenceContent).toContain('## #194 — Organisation, project and default Sky clause sheet')
    expect(evidenceContent).toContain('## #531 — Production /ledger/verify for the pilot project')
    expect(evidenceContent).toContain('"valid":true')
    expect(evidenceContent).toContain('## #194 — Approver rota configured (your confirmation')
    expect(evidenceContent).toContain('## #194 — Confirmed subscriber counts')
    expect(evidenceContent).toContain('## #539 — Malay reader sign-off on packages/i18n/catalogue/ms/replies.json')
  })

  test('stops and says so when it cannot read an answer, rather than carrying on as if it were empty', () => {
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({ '*/v1/projects/*/subscriber-counts': { status: 200, body: '<html>maintenance</html>' } })
    })

    expect(result.status).toBe(1)
    expect(output).toContain("Couldn't read int(data['confirmed']) from the HTTP 200 answer.")
    expect(output).not.toContain('maintenance')
    expect(output).toContain('Stopped in stage 10/')
    expect(evidenceContent).not.toContain('Confirmed subscriber counts')
  })

  test('reports a ledger chain that does not verify, and records no #531 verify evidence', () => {
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({
        '*/v1/projects/*/ledger/verify': json(200, {
          ...ledgerVerify,
          valid: false,
          checked_entries: 3,
          first_bad_entry_id: '019a7000-0000-7000-8000-0000000000aa'
        })
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain("The ledger chain doesn't verify")
    expect(output).toContain('019a7000-0000-7000-8000-0000000000aa')
    expect(evidenceContent).not.toContain('/ledger/verify')
  })

  test('records no empty evidence: windows still empty after declaring, or a job with no execution', () => {
    const { result, output, evidenceContent } = runWizard({
      input: [...answers.slice(0, 11), '', ...answers.slice(11)],
      curl: production({ '*/v1/projects/*/windows': json(200, { data: [], next_cursor: null }) }),
      gcloud: gcloud({
        'run jobs list *': { stdout: 'commons-provision\n' },
        'run jobs executions list --job=commons-provision *': { stdout: '' }
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('The project still has no window')
    expect(output).toContain('commons-provision has no execution yet')
    expect(evidenceContent).not.toContain('Declared project windows')
    expect(evidenceContent).not.toContain('## #622')
  })

  test('stops on a count that is not a number', () => {
    const { result, output } = runWizard({
      input: answers,
      curl: production({ '*/v1/projects/*/subscriber-counts': json(200, { ...subscriberCounts(2), confirmed: null }) })
    })

    expect(result.status).toBe(1)
    expect(output).toContain("Couldn't read int(data['confirmed'])")
  })

  test('records no project evidence when the clause sheets read fails, and says why', () => {
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({
        '*/v1/projects/*/clause-sheets': json(503, {
          type: 'https://docs.skyclause.m1ku.tech/problems/internal-error',
          title: 'Internal error',
          status: 503,
          detail: 'The server failed to answer this request.'
        })
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain(`GET /v1/projects/${PROJECT_ID}/clause-sheets answered HTTP 503`)
    expect(evidenceContent).not.toContain('## #194 — Organisation, project and default Sky clause sheet')
  })

  test('names #138 and #139 only when production answers not-built for them', () => {
    const { result, output } = runWizard({
      curl: production({
        '*/v1/catalogue/sources': json(200, { data: [], next_cursor: null }),
        '*/v1/projects/*/windows': json(200, {
          data: [{ id: 'win-1', kind: 'storm_afternoon', date: '2026-11-12', start: '14:00', end: '19:15' }],
          next_cursor: null
        })
      }),
      input: [
        ...answers.slice(0, 6),
        'y', // open /new?
        '', // created
        keyLine, // read key line: id and key
        '', // stage 5
        '', // stage 6
        '', // stage 7: sources bound
        ...answers.slice(10)
      ]
    })

    expect(result.status, output).toBe(0)
    expect(output).not.toContain('#138')
    expect(output).not.toContain('#139')
    expect(output).toContain('#133')
  })

  test('reports a 501 that is not the not-built problem as a failed read, not as waiting on a ticket', () => {
    const { result, output } = runWizard({
      input: answers,
      curl: production({
        '*/v1/catalogue/sources': { status: 501, body: '<html><body>501 Not Implemented</body></html>' }
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('GET /v1/catalogue/sources answered HTTP 501')
    expect(output).not.toContain('b-source-binding, #138')
  })

  test('reports a failed Cloud Run read as a failed read, not as waiting on #179', () => {
    const { result, output } = runWizard({
      input: answers,
      gcloud: gcloud({
        'run jobs list *': {
          exit: 1,
          stderr: 'ERROR: (gcloud.run.jobs.list) PERMISSION_DENIED: Permission denied on resource project skyclause.\n'
        }
      })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('PERMISSION_DENIED')
    expect(output).toContain("Couldn't list Cloud Run jobs")
    expect(output).not.toContain('#179')
  })

  test('re-running reuses the saved slugs and records each step production has built, saying what it does not prove', () => {
    const { result, output, evidenceContent } = runWizard({
      existingEnvFile: "ORG_SLUG='skyclause-ops'\nPROJECT_SLUG='bukit-jalil'\n",
      curl: production({
        '*/v1/catalogue/sources': json(200, { data: [], next_cursor: null }),
        '*/v1/projects/*/windows': json(200, {
          data: [{ id: 'win-1', kind: 'storm_afternoon', date: '2026-11-12', start: '14:00', end: '19:15' }],
          next_cursor: null
        }),
        '*/v1/projects/*/calls?state=sent&limit=1': json(200, {
          data: [{ id: 'call-1', state: 'sent' }],
          next_cursor: null
        }),
        '*/v1/projects/*/ledger?kind=crowd_reply': json(200, {
          data: [
            { id: 'led-1', project_id: PROJECT_ID, seq: 2, kind: 'crowd_reply', refs: {}, body: { answer: 'keep' } }
          ],
          next_cursor: null,
          total: 1
        })
      }),
      input: [
        '', // banner
        '', // stage 1
        '', // stage 2
        '', // stage 3: signed in
        '', // ORG_SLUG: Enter keeps it
        '', // PROJECT_SLUG: Enter keeps it
        'n', // open /new?
        keyLine, // read key line: id and key
        '', // stage 5
        '', // stage 6
        '', // stage 7: sources bound
        '', // stage 7
        '', // stage 8
        'y', // rota saved?
        '', // stage 9
        '', // stage 10
        'y', // webhook registered?
        '', // stage 11
        'y', // Malay sign-off?
        'n' // revoke the key?
      ]
    })

    expect(result.status, output).toBe(0)
    expect(evidenceContent).not.toContain(secretKey)
    expect(evidenceContent).toContain('## #194 — Project summary after binding the Bukit Jalil sources')
    expect(evidenceContent).toContain('## #194 — Declared project windows')
    expect(evidenceContent).toContain('## #194 — Webhook endpoint registered (your confirmation')
    expect(evidenceContent).toContain(
      '## #534 — Production ICS feed with a sent call (not validated: needs a strict RFC 5545 validator)'
    )
    expect(evidenceContent).toContain('UID:call-1@skyclause.m1ku.tech')
    expect(evidenceContent).toContain('## #539 — Production crowd_reply ledger entries')
    expect(output).toContain('#534 run a strict RFC 5545 validator on the recorded feed')
  })
})

describe('infra/wizards/production-pilot.sh API key', () => {
  const revokeLine = `fetch('/api/orgs/skyclause-ops/api-keys/${keyId}',{method:'DELETE'}).then(r=>console.log('revoked','${keyId}',r.status))`
  const throughKey = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    keyLine // read key line: id and key
  ]
  const toRevoke = [
    ...throughKey,
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'n', // rota saved?
    '', // stage 9
    '', // stage 10
    'n', // webhook registered?
    '', // stage 11
    'n' // Malay sign-off?
  ]

  test('asks for a 1-day read key, says creating one needs a sign-in within 12 hours', () => {
    const { result, output } = runWizard({ input: [...toRevoke, 'n'] })

    expect(result.status, output).toBe(0)
    expect(output).toContain('within the last 12 hours')
    expect(output).toContain("name:'production-pilot',scopes:['read'],expires_in_days:1")
    expect(output).toContain("console.log(d.key?d.id+' '+d.key:d)")
    expect(output).not.toContain('expires_in_days:90')
    expect(output).not.toContain('10 minutes')
  })

  test('offers revoking the key as the last stage, and checks it then answers 401', () => {
    const { result, output, calls } = runWizard({ input: [...toRevoke, 'y', ''] })

    expect(result.status, output).toBe(0)
    expect(output).toMatch(/Stage 13\/13 · Revoke this run's API key/)
    expect(output).toContain(revokeLine)
    expect(output).toContain('✓ revoked skc_live…')
    expect(calls.curl).toContain('/v1/projects\\?limit=1')
  })

  test("the revoke line revokes only this run's key, not a teammate's key of the same name", async () => {
    const { result, output } = runWizard({ input: [...toRevoke, 'y', ''] })
    expect(result.status, output).toBe(0)
    expect(output).toContain(`Revoke only this run's key (id ${keyId})`)

    // Run the line the person pastes into DevTools against an organisation whose owner sees both keys.
    const line = output
      .split('\n')
      .map((text) => text.trim())
      .find((text) => text.startsWith('fetch(') && text.includes("method:'DELETE'"))
    expect(line).toBeDefined()
    const keys = [
      { id: keyId, name: 'production-pilot', created_by: 'acc-owner' },
      { id: 'teammate0key0id00000000000000000', name: 'production-pilot', created_by: 'acc-teammate' }
    ]
    const deleted: string[] = []
    const fakeFetch = async (url: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') deleted.push(url)
      return { status: init?.method === 'DELETE' ? 204 : 200, json: async () => ({ data: keys, next_cursor: null }) }
    }
    // Runs the printed line as DevTools would.
    await new Function('fetch', 'console', `return ${line}`)(fakeFetch, { log: () => {} })
    expect(deleted).toEqual([`/api/orgs/skyclause-ops/api-keys/${keyId}`])
  })

  test('answering "n" to revoking leaves the exact way to revoke it in the to-do list', () => {
    const { result, output, calls } = runWizard({ input: [...toRevoke, 'n'] })

    expect(result.status, output).toBe(0)
    expect(output.slice(output.indexOf('still to do by hand'))).toContain(revokeLine)
    expect(calls.curl).not.toContain('/v1/projects\\?limit=1')
  })

  test('a run that stops after the key is pasted says how to revoke it', () => {
    const { result, output } = runWizard({
      input: throughKey,
      curl: production({ '*/v1/projects?slug=*include=summary': json(200, { data: [], next_cursor: null }) })
    })

    expect(result.status).toBe(1)
    expect(output).toContain('Stopped in stage 5/')
    expect(output).toContain(revokeLine)
  })
})
