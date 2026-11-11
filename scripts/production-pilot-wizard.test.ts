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
    'secrets versions list ONCALL_CONTACTS *': {
      stdout: 'NAME  STATE    CREATE_TIME\n1     ENABLED  2026-11-11T03:00:00Z\n'
    },
    'run jobs list *': { stdout: '' },
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
    expect(line).toMatch(/^(secrets versions list|run jobs list|run jobs executions list) /)
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
    secretKey, // read key
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

describe('infra/wizards/production-pilot.sh reports what still waits, and every failure', () => {
  const answers = [
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
    expect(evidenceContent).toContain(
      '## #118 / #629 — ONCALL_CONTACTS has an enabled version (listed by name, never accessed; the channels and a test page are still to check)'
    )
    expect(output).toContain(
      '#629 check the on-call notification channels exist and a test incident pages within 5 minutes'
    )
    expect(evidenceContent).toContain('## #194 — Organisation, project and default Sky clause sheet')
    expect(evidenceContent).toContain('## #531 — Production /ledger/verify for the pilot project')
    expect(evidenceContent).toContain('"valid":true')
    expect(evidenceContent).toContain('## #194 — Approver rota configured (your confirmation')
    expect(evidenceContent).toContain('## #194 — Confirmed subscriber counts')
    expect(evidenceContent).toContain('## #539 — Malay reader sign-off on packages/i18n/catalogue/ms/replies.json')
  })

  test("stops with gcloud's own error and a sign-in hint when gcloud is signed out", () => {
    const { result, output } = runWizard({
      input: answers,
      gcloud: gcloud({
        'secrets versions list ONCALL_CONTACTS *': {
          exit: 1,
          stderr: 'ERROR: (gcloud.secrets.versions.list) You do not currently have an active account selected.\n'
        }
      })
    })

    expect(result.status).toBe(1)
    expect(output).toContain('You do not currently have an active account selected.')
    expect(output).toContain("Sign in as a project owner with 'gcloud auth login'")
    expect(output).toContain('Stopped in stage 1/')
  })

  test('stops and says so when it cannot read an answer, rather than carrying on as if it were empty', () => {
    const { result, output, evidenceContent } = runWizard({
      input: answers,
      curl: production({ '*/v1/projects/*/subscriber-counts': { status: 200, body: '<html>maintenance</html>' } })
    })

    expect(result.status).toBe(1)
    expect(output).toContain("Couldn't read data['confirmed'] from the answer: <html>maintenance</html>")
    expect(output).toContain('Stopped in stage 10/')
    expect(evidenceContent).not.toContain('Confirmed subscriber counts')
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
        '*/v1/projects/*/windows': json(200, { data: [], next_cursor: null }),
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
        secretKey, // read key
        '', // stage 5
        '', // stage 6
        '', // stage 7: sources bound
        '', // stage 7
        '', // stage 8: windows declared
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
  const revokeLine =
    "fetch('/api/orgs/skyclause-ops/api-keys?limit=200').then(r=>r.json()).then(d=>Promise.all(d.data.filter(k=>k.name==='production-pilot')" +
    ".map(k=>fetch('/api/orgs/skyclause-ops/api-keys/'+k.id,{method:'DELETE'}).then(r=>console.log('revoked',k.id,r.status)))))"
  const throughKey = [
    '', // banner
    '', // stage 1
    '', // stage 2
    '', // stage 3: signed in
    'skyclause-ops', // ORG_SLUG
    'bukit-jalil', // PROJECT_SLUG
    'n', // open /new?
    secretKey // read key
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
