import { spawnSync } from 'node:child_process'
import { accessSync, chmodSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const wizardPath = fileURLToPath(new URL('../infra/wizards/production-pilot.sh', import.meta.url))
const templatePath = fileURLToPath(new URL('../.agents/skills/wizard/template.sh', import.meta.url))

const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
config=""
for ((i = 1; i <= $#; i++)); do
  if [[ "\${!i}" == "-K" ]]; then
    config="$(cat)"
    break
  fi
done
if [[ -n "$config" ]]; then
  printf '%s\\n' "$config" >> "$FAKE_STATE/curl_stdin"
fi
printf '%s\\n' "$url" >> "$FAKE_STATE/curl_urls"

reply() {
  local code="$1" body="$2"
  if [[ " $* " == *" -w "* ]] || [[ "\${*}" == *"http_code"* ]]; then
    printf '%s\\n%s' "$body" "$code"
  else
    printf '%s' "$body"
  fi
}

# Check if -w '%{http_code}' with -o /dev/null was used
status_only=no
for arg in "$@"; do
  [[ "$arg" == "/dev/null" ]] && status_only=yes
done

respond() {
  local code="$1" body="$2"
  if [[ "$status_only" == yes ]]; then
    printf '%s' "$code"
    return 0
  fi
  for arg in "$@"; do
    if [[ "$arg" == *"http_code"* ]]; then
      printf '%s\\n%s' "$body" "$code"
      return 0
    fi
  done
  [[ "$code" == 2* ]] || exit 22
  printf '%s' "$body"
}

case "$url" in
  */health)
    respond 200 "ok" "$@" ;;
  */api/auth/sign-in/magic-link)
    cat >> "$FAKE_STATE/magic_body"
    respond "\${FAKE_MAGIC_STATUS:-500}" '{"message":"error"}' "$@" ;;
  */v1/projects\\?slug=*include=summary)
    respond 200 '{"data":[{"id":"019a7000-0000-7000-8000-000000000001","slug":"bukit-jalil","name":"Bukit Jalil","packs":[{"pack":"sky","enabled":true,"sheet_id":"019a7000-0000-7000-8000-000000000002","schedule":null,"sla_s":600}],"summary":{"next_action":"bind_source"}}],"next_cursor":null}' "$@" ;;
  */v1/projects/*/clause-sheets)
    respond 200 '{"data":[{"id":"019a7000-0000-7000-8000-000000000002","pack":"sky","live_version":{"n":1,"status":"published"}}]}' "$@" ;;
  */v1/projects/*/ledger/verify)
    respond 200 '{"valid":true,"checked_entries":0,"first_bad_entry_id":null,"head_hash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","verified_at":"2026-11-11T03:30:00Z"}' "$@" ;;
  */v1/projects/*/pilot-archive)
    respond 200 '{"data":[],"next_cursor":null,"label":"pilot"}' "$@" ;;
  */v1/catalogue/sources)
    respond "\${FAKE_SOURCES_STATUS:-501}" '{"type":"https://skyclause.m1ku.tech/problems/not-built","status":501,"owner":"b-source-binding"}' "$@" ;;
  */v1/projects/*/windows)
    respond "\${FAKE_WINDOWS_STATUS:-501}" '{"type":"https://skyclause.m1ku.tech/problems/not-built","status":501,"owner":"b-windows-api"}' "$@" ;;
  */v1/projects/*/subscriber-counts)
    respond 200 "{\\"confirmed\\":\${FAKE_CONFIRMED_SUBSCRIBERS:-2},\\"pending\\":0,\\"unsubscribed\\":0,\\"by_window\\":[],\\"by_channel\\":[{\\"channel\\":\\"email\\",\\"count\\":2}]}" "$@" ;;
  */v1/webhooks)
    respond "\${FAKE_WEBHOOKS_STATUS:-501}" '{"type":"https://skyclause.m1ku.tech/problems/not-built","status":501,"owner":"e-webhooks"}' "$@" ;;
  */v1/projects/*/ics-feeds)
    respond "\${FAKE_ICS_FEEDS_STATUS:-501}" '{"type":"https://skyclause.m1ku.tech/problems/not-built","status":501,"owner":"b-windows-api"}' "$@" ;;
  */v1/projects/*/calls)
    respond 200 "{\\"data\\":\${FAKE_CALLS_JSON:-[]},\\"next_cursor\\":null}" "$@" ;;
  */v1/projects/*/ledger\\?kind=crowd_reply)
    respond 200 "{\\"data\\":\${FAKE_REPLIES_JSON:-[]},\\"next_cursor\\":null,\\"total\\":0}" "$@" ;;
  */p/*/*/calendar.ics)
    respond 200 $'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:call-1@skyclause.m1ku.tech\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n' "$@" ;;
  *)
    respond 200 "{}" "$@" ;;
esac
`

const fakeGcloud = `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"secrets versions list ONCALL_CONTACTS"*value*)
    if [[ "\${FAKE_ONCALL_READY:-1}" == "1" ]]; then echo "1"; fi ;;
  *"secrets versions list ONCALL_CONTACTS"*)
    printf 'NAME  STATE    CREATE_TIME\\n1     ENABLED  2026-11-11T03:00:00Z\\n' ;;
  *"run jobs describe commons-provision"*)
    exit 1 ;;
  *)
    exit 0 ;;
esac
`

const fakeAws = `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"sts get-caller-identity"*)
    echo "776566309118" ;;
  *"sns list-subscriptions-by-topic"*"Subscriptions[0].SubscriptionArn"*)
    echo "arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events:sub-123" ;;
  *"sns list-subscriptions-by-topic"*)
    printf 'https\\thttps://api.skyclause.m1ku.tech/ses/events\\tarn:aws:sns:ap-southeast-2:776566309118:skyclause-production-ses-events:sub-123\\n' ;;
  *)
    exit 0 ;;
esac
`

const fakeBun = `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"check-unbuilt.ts --owner"* ]]; then
  owner="\${!#}"
  if [[ " \${FAKE_BUILT_OWNERS:-} " == *" $owner "* ]]; then
    exit 0
  fi
  exit 1
fi
exit 0
`

function runWizard(options: { input: string[]; env?: Record<string, string>; existingEnvFile?: string }) {
  const dir = plantRepo({
    'bin/curl': fakeCurl,
    'bin/gcloud': fakeGcloud,
    'bin/aws': fakeAws,
    'bin/bun': fakeBun,
    'bin/open': '#!/usr/bin/env bash\nexit 0\n',
    'bin/wslview': '#!/usr/bin/env bash\nexit 1\n'
  })
  for (const b of ['curl', 'gcloud', 'aws', 'bun', 'open', 'wslview']) {
    chmodSync(join(dir, 'bin', b), 0o755)
  }
  const stateDir = join(dir, 'state')
  mkdirSync(stateDir, { recursive: true })
  const envFile = join(dir, 'wizard.env')
  const evidenceFile = join(dir, 'production-pilot.evidence.md')
  if (options.existingEnvFile) {
    writeFileSync(envFile, options.existingEnvFile, { mode: 0o600 })
  }

  const result = spawnSync('bash', [wizardPath], {
    cwd: repoRoot,
    input: `${options.input.join('\n')}\n`,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      FAKE_STATE: stateDir,
      ENV_FILE: envFile,
      EVIDENCE_FILE: evidenceFile,
      ...options.env
    }
  })

  return {
    result,
    envContent: readFileSync(envFile, 'utf8'),
    evidenceContent: readFileSync(evidenceFile, 'utf8'),
    stateDir
  }
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

describe('infra/wizards/production-pilot.sh live precondition checks and redacted evidence', () => {
  test('skips 501/500 blocked steps naming their issue numbers and records redacted evidence without leaking secrets or emails', () => {
    const secretKey = 'skc_live_9876543210abcdefSECRETVALUE'
    const secretEmail = 'pilot-tester@example.org'

    const { result, envContent, evidenceContent } = runWizard({
      input: [
        '', // banner pause
        '', // Stage 1 pause
        '', // Stage 2 (#622) pause
        'y', // Stage 3: test #113 magic link?
        secretEmail, // hidden email for magic-link check (returns 500)
        '', // Stage 3 pause
        'skyclause-ops', // Stage 4: ORG_SLUG
        'bukit-jalil', // Stage 4: PROJECT_SLUG
        'n', // Stage 4: open /new in browser?
        secretKey, // Stage 5: SKYCLAUSE_API_KEY (hidden)
        '', // Stage 5 pause
        '', // Stage 6 (#531 ledger/verify) pause
        '', // Stage 7 (#194 sources 501) pause
        '', // Stage 8 (#194 windows 501) pause
        'y', // Stage 9 (#194 rota) confirm
        '', // Stage 9 pause
        '', // Stage 10 (#194 subscriber-counts >= 2) pause
        '', // Stage 11 (#194 webhooks 501 & #534 ics 501) pause
        'y' // Stage 12 (#539 Malay reader sign-off) confirm
      ]
    })

    expect(result.status, result.stderr).toBe(0)
    const output = result.stdout + result.stderr

    // Reports every unbuilt or blocked step with its issue number
    expect(output).toContain('#210')
    expect(output).toContain('#179')
    expect(output).toContain('#623')
    expect(output).toContain('#138')
    expect(output).toContain('#139')
    expect(output).toContain('#193')
    expect(output).toContain('#133')

    // Never leaks the full API key or the typed email address anywhere
    expect(output).not.toContain(secretKey)
    expect(output).not.toContain(secretEmail)
    expect(envContent).not.toContain(secretKey)
    expect(envContent).not.toContain(secretEmail)
    expect(evidenceContent).not.toContain(secretKey)
    expect(evidenceContent).not.toContain(secretEmail)

    // Shows the API key only by its 8-char prefix
    expect(evidenceContent).toContain('skc_live…')

    // Persists only non-secret slugs and project ID in ENV_FILE
    expect(envContent).toContain("ORG_SLUG='skyclause-ops'")
    expect(envContent).toContain("PROJECT_SLUG='bukit-jalil'")
    expect(envContent).toContain("PROJECT_ID='019a7000-0000-7000-8000-000000000001'")

    // Captures paste-ready evidence for the steps that succeeded
    expect(evidenceContent).toContain('## #118 / #629')
    expect(evidenceContent).toContain('## #194 — Organisation, project and default Sky clause sheet')
    expect(evidenceContent).toContain('## #531 — Production /ledger/verify for the pilot project')
    expect(evidenceContent).toContain('"valid":true')
    expect(evidenceContent).toContain('## #194 — Approver rota configured')
    expect(evidenceContent).toContain('## #194 — Confirmed subscriber counts')
    expect(evidenceContent).toContain('## #536 / #113 — Confirmed ses_events SNS subscription')
    expect(evidenceContent).toContain('## #539 — Malay reader sign-off on packages/i18n/catalogue/ms/replies.json')
  })

  test('re-running reuses saved slugs from .env and captures newly built steps when their endpoints answer 200', () => {
    const secretKey = 'skc_live_9876543210abcdefSECRETVALUE'
    const secretEmail = 'pilot-tester@example.org'

    const { result, evidenceContent } = runWizard({
      existingEnvFile: "ORG_SLUG='skyclause-ops'\nPROJECT_SLUG='bukit-jalil'\n",
      env: {
        FAKE_MAGIC_STATUS: '200',
        FAKE_SOURCES_STATUS: '200',
        FAKE_WINDOWS_STATUS: '200',
        FAKE_WEBHOOKS_STATUS: '200',
        FAKE_ICS_FEEDS_STATUS: '200',
        FAKE_CALLS_JSON: '[{"id":"call-1","state":"sent"}]',
        FAKE_REPLIES_JSON: '[{"id":"led-1","seq":2,"kind":"crowd_reply"}]',
        FAKE_BUILT_OWNERS: 'e-webhooks b-evaluator'
      },
      input: [
        '', // banner pause
        '', // Stage 1 pause
        '', // Stage 2 pause
        'y', // Stage 3: test #113 magic link?
        secretEmail, // hidden email
        'y', // Stage 3: did magic link arrive in inbox?
        '', // Stage 3 pause
        '', // Stage 4: Enter keeps existing ORG_SLUG
        '', // Stage 4: Enter keeps existing PROJECT_SLUG
        'n', // Stage 4: open /new?
        secretKey, // Stage 5: SKYCLAUSE_API_KEY
        '', // Stage 5 pause
        '', // Stage 6 pause
        '', // Stage 7: pause after binding sources
        '', // Stage 7: end-of-stage pause
        '', // Stage 8: pause after declaring windows
        '', // Stage 8: end-of-stage pause
        'y', // Stage 9: rota confirm
        '', // Stage 9 pause
        '', // Stage 10: subscriber counts pause
        'y', // Stage 11: webhook confirm
        '', // Stage 11 pause
        'y' // Stage 12: Malay sign-off confirm
      ]
    })

    expect(result.status, result.stderr).toBe(0)
    expect(evidenceContent).not.toContain(secretKey)
    expect(evidenceContent).not.toContain(secretEmail)
    expect(evidenceContent).toContain('## #113 — Production magic link reaches a team inbox')
    expect(evidenceContent).toContain('<redacted-email>')
    expect(evidenceContent).toContain('## #194 — Project summary after binding Bukit Jalil sources')
    expect(evidenceContent).toContain('## #194 — Declared project windows')
    expect(evidenceContent).toContain('## #194 — Webhook endpoint registered')
    expect(evidenceContent).toContain('## #534 — Production ICS feed with sent call')
    expect(evidenceContent).toContain('UID:call-1@skyclause.m1ku.tech')
    expect(evidenceContent).toContain('## #539 — Production crowd_reply ledger entry')
  })
})
