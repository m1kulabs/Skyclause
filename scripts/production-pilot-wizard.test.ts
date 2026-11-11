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
// $FAKE_STATE/unexpected, which fails the test. terraform, gh and bun get no routes, so any call to them fails.
const fakeCli = `#!/usr/bin/env bash
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

// curl answers by URL; a write flag is never expected, whatever the URL.
const fakeCurl = `#!/usr/bin/env bash
printf '%q ' "$@" >> "$FAKE_STATE/curl.calls"
printf '\\n' >> "$FAKE_STATE/curl.calls"
url="\${!#}"
with_code=no
for arg in "$@"; do
  case "$arg" in
    -K) cat >> "$FAKE_STATE/curl.stdin"; printf '\\n' >> "$FAKE_STATE/curl.stdin" ;;
    -X | --request | -d | --data* | -F | --form | -T | --upload-file | --json)
      printf 'curl %s\\n' "$*" >> "$FAKE_STATE/unexpected"
      exit 97 ;;
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
    'https://docs.skyclause.m1ku.tech/': { status: 200, body: '<html id="__next_error__"></html>' },
    '*/v1/projects?slug=*include=summary': json(200, { data: [project], next_cursor: null }),
    '*/v1/projects/*/clause-sheets': json(200, {
      data: [{ id: '019a7000-0000-7000-8000-000000000002', pack: 'sky', live_version: { n: 1, status: 'published' } }]
    }),
    '*/v1/projects/*/ledger/verify': json(200, ledgerVerify),
    '*/v1/projects/*/pilot-archive': json(200, { data: [], next_cursor: null, label: 'pilot' }),
    '*/v1/catalogue/sources': notBuilt('b-source-binding'),
    '*/v1/projects/*/windows': notBuilt('b-windows-api'),
    '*/v1/projects/*/subscriber-counts': json(200, subscriberCounts(2)),
    '*/v1/webhooks': notBuilt('e-webhooks'),
    '*/v1/projects/*/ics-feeds': notBuilt('b-windows-api'),
    '*/v1/projects/*/calls*': json(200, { data: [], next_cursor: null }),
    '*/v1/projects/*/ledger?kind=crowd_reply': json(200, { data: [], next_cursor: null, total: 0 }),
    '*/p/*/*/calendar.ics': {
      status: 200,
      body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:call-1@skyclause.m1ku.tech\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
    },
    ...overrides
  }
}

const TOPIC = 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events'
const sesSubscription = (arn: string): CliReply => ({
  stdout: `https\thttps://api.skyclause.m1ku.tech/ses/events\t${arn}\n`
})

function gcloud(overrides: Record<string, CliReply> = {}): Record<string, CliReply> {
  return {
    'secrets versions list ONCALL_CONTACTS *value*': { stdout: '1\n' },
    'secrets versions list ONCALL_CONTACTS *': {
      stdout: 'NAME  STATE    CREATE_TIME\n1     ENABLED  2026-11-11T03:00:00Z\n'
    },
    'run jobs describe commons-provision *': {
      exit: 1,
      stderr: 'ERROR: (gcloud.run.jobs.describe) Cannot find job.\n'
    },
    ...overrides
  }
}

function aws(overrides: Record<string, CliReply> = {}): Record<string, CliReply> {
  return {
    'sts get-caller-identity *': { stdout: '776566309118\n' },
    'sns list-subscriptions-by-topic *': sesSubscription(`${TOPIC}:sub-123`),
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
  'shasum',
  'awk',
  'wc',
  'tr',
  'tail'
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
  aws?: Record<string, CliReply>
  existingEnvFile?: string
}) {
  const dir = plantRepo({ 'bin/curl': fakeCurl, 'bin/open': '#!/usr/bin/env bash\nexit 0\n' })
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
  for (const [tool, table] of [
    ['gcloud', options.gcloud ?? gcloud()],
    ['aws', options.aws ?? aws()]
  ] as const) {
    routes(
      tool,
      Object.entries(table).map(
        ([glob, r]) => `${glob}\t${r.exit ?? 0}\t${reply(r.stdout ?? '')}\t${reply(r.stderr ?? '')}`
      )
    )
  }
  for (const tool of ['terraform', 'gh', 'bun']) routes(tool, [])

  const envFile = join(dir, 'wizard.env')
  const evidenceFile = join(dir, 'production-pilot.evidence.md')
  if (options.existingEnvFile) writeFileSync(envFile, options.existingEnvFile, { mode: 0o600 })

  // Only what bash and python3 need; no credential reaches the run, and HOME holds no CLI configuration.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['LANG', 'LC_ALL'].includes(key)))
  const result = spawnSync(join(bin, 'bash'), [wizardPath], {
    cwd: repoRoot,
    input: `${options.input.join('\n')}\n`,
    encoding: 'utf8',
    env: {
      ...inherited,
      PATH: bin,
      HOME: dir,
      FAKE_STATE: state,
      ENV_FILE: envFile,
      EVIDENCE_FILE: evidenceFile
    }
  })

  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
  expect(read(join(state, 'unexpected')), 'a call no stand-in answers').toBe('')
  return {
    result,
    output: result.stdout + result.stderr,
    envContent: read(envFile),
    evidenceContent: read(evidenceFile),
    calls: {
      curl: read(join(state, 'curl.calls')),
      curlStdin: read(join(state, 'curl.stdin')),
      gcloud: read(join(state, 'gcloud.calls')),
      aws: read(join(state, 'aws.calls'))
    }
  }
}

const secretKey = 'skc_live_9876543210abcdefSECRETVALUE'

// Every remote call is a read: GETs to production, and list or identity reads in gcloud and aws.
function expectOnlyReads(calls: ReturnType<typeof runWizard>['calls']) {
  for (const line of calls.gcloud.trim().split('\n').filter(Boolean)) {
    expect(line).toMatch(/^(secrets versions list|run jobs (list|describe|executions list)) /)
  }
  for (const line of calls.aws.trim().split('\n').filter(Boolean)) {
    expect(line).toMatch(/^(sts get-caller-identity|sns list-subscriptions-by-topic) /)
  }
  expect(calls.curl).not.toMatch(/(^| )(-X|--request|-d|--data[a-z-]*|-F|--form|-T|--json) /m)
  // curl's stdin config only ever adds headers.
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

    const bashCheck = spawnSync('bash', ['-n', wizardPath], { cwd: repoRoot, encoding: 'utf8' })
    expect(bashCheck.status, bashCheck.stderr).toBe(0)

    const shellcheck = spawnSync('shellcheck', ['infra/wizards/production-pilot.sh'], {
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
    secretKey, // read key
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'n', // rota saved?
    '', // stage 9
    '', // stage 10
    '', // stage 11
    'n', // Malay sign-off?
    'n' // revoke? (later stages)
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
    secretKey, // read key
    '', // stage 5
    '', // stage 6
    '', // stage 7
    '', // stage 8
    'y', // rota saved?
    '', // stage 9
    '', // stage 10
    '', // stage 11
    'y', // Malay sign-off?
    'y' // revoke? (later stages)
  ]

  test('answering "n" to every confirmation performs no write of any kind', () => {
    const { result, calls, evidenceContent } = runWizard({ input: allNo })

    expect(result.status, result.stdout + result.stderr).toBe(0)
    expectOnlyReads(calls)
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

  test('reports a pending ses_events subscription with the README procedure, and never runs Terraform', () => {
    const { result, output } = runWizard({
      input: allYes,
      aws: aws({ 'sns list-subscriptions-by-topic *': sesSubscription('PendingConfirmation') })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('PendingConfirmation')
    expect(output).toContain('terraform -chdir=infra/aws apply -replace=aws_sns_topic_subscription.ses_events')
  })

  test('reports a failed AWS read as a failed read, not as a pending subscription', () => {
    const denied: CliReply = {
      exit: 254,
      stderr:
        'An error occurred (AuthorizationError) when calling the ListSubscriptionsByTopic operation: User is not authorized\n'
    }
    const { result, output } = runWizard({
      input: allYes,
      aws: aws({ 'sns list-subscriptions-by-topic *': denied })
    })

    expect(result.status, output).toBe(0)
    expect(output).toContain('AuthorizationError')
    expect(output).toContain("Couldn't read the ses_events subscription")
    expect(output).not.toContain("isn't confirmed")
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
    secretKey // read key
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
    ['an API key', secretKey],
    ['an email address', 'pilot-tester@example.org']
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
