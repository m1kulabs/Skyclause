import { spawnSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
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
const wizardPath = fileURLToPath(new URL('../infra/wizards/resend.sh', import.meta.url))
const templatePath = fileURLToPath(new URL('../.agents/skills/wizard/template.sh', import.meta.url))
const fake = (name: string) => fileURLToPath(new URL(`./wizard-fakes/${name}`, import.meta.url))

const SENDING = 'notices.skyclause.m1ku.tech'
const RECEIVING = 'in.skyclause.m1ku.tech'
const WORKER_URL = 'https://worker-413187272599.asia-southeast1.run.app'
const FULL_KEY = 're_fullaccess_0123456789abcdef'
const SENDING_ONLY_KEY = 're_sendingonly_0123456789abcdef'
const CLOUDFLARE_TOKEN = 'cloudflare-test-token'
// The DKIM value and the receiving MX host are copied from Resend's create-domain and receiving docs.
const DKIM =
  'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDsc4Lh8xilsngyKEgN2S84+21gn+x6SEXtjWvPiAAmnmggr5FWG42WnqczpzQ/mNblqHz4CDwUum6LtY6SdoOlDmrhvp5khA3cd661W9FlK3yp7+jVACQElS7d9O6jv8VsBbVg4COess3gyLE5RyxqF1vYsrEXqyM8TBz1n5AGkQIDAQA2'
const SPF = 'v=spf1 include:amazonses.com ~all'
const EVENTS = ['email.delivered', 'email.bounced', 'email.complained', 'email.suppressed', 'email.received']
const TFVARS = 'supplied_secrets = ["GOOGLE_CLIENT_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]\n'
const ALL_SUPPLIED =
  'supplied_secrets = ["GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RESEND_RECEIVING_API_KEY", "RESEND_WEBHOOK_SECRET", "SKYCLAUSE_STAFF_EMAILS", "TURNSTILE_SECRET_KEY"]'

// What Cloudflare holds before the wizard runs: the SES records, each entered through the record script.
const ses = (type: string, name: string, content: string, priority?: number) => ({
  type,
  name,
  content,
  priority,
  proxied: type === 'CNAME' ? false : undefined,
  comment: 'owner: skyclause'
})
const SES_RECORDS = [
  ses('CNAME', 'aaa111._domainkey.notices.skyclause.m1ku.tech', 'aaa111.dkim.amazonses.com'),
  ses('CNAME', 'bbb222._domainkey.in.skyclause.m1ku.tech', 'bbb222.dkim.amazonses.com'),
  ses('MX', 'bounce.notices.skyclause.m1ku.tech', 'feedback-smtp.ap-southeast-2.amazonses.com', 10),
  ses('TXT', 'bounce.notices.skyclause.m1ku.tech', SPF),
  ses('TXT', '_dmarc.notices.skyclause.m1ku.tech', 'v=DMARC1; p=quarantine; rua=mailto:dmarc@in.skyclause.m1ku.tech'),
  ses('MX', 'in.skyclause.m1ku.tech', 'inbound-smtp.ap-southeast-2.amazonaws.com', 10)
]

interface Behaviour {
  recordNames: 'zone' | 'domain'
  sendingRecords: 'mx-txt' | 'cname'
  receivingMx: string
  verifyAfter: number
  verifyOutcome?: 'failed'
  extraRecord?: Record<string, unknown>
  secrets: string[]
}

// The run's PATH is the stand-ins plus links to these utilities, so no other tool on this machine is reachable.
const SYSTEM_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
const UTILITIES = ['bash', 'python3', 'cat', 'grep', 'mktemp', 'rm', 'dirname', 'basename']

function systemTool(name: string) {
  const dir = SYSTEM_DIRS.find((candidate) => existsSync(join(candidate, name)))
  if (!dir) throw new Error(`${name} is needed to run the wizard's tests`)
  return realpathSync(join(dir, name))
}

function realBun() {
  const found = spawnSync('sh', ['-c', 'command -v bun'], { encoding: 'utf8' }).stdout.trim()
  if (!found) throw new Error("bun is needed to run the wizard's tests")
  return found
}

// Stand-ins for every tool the wizard reaches out through. curl is the Resend API, gcloud is Secret Manager and
// Cloud Run's worker, and bun runs the real scripts/cloudflare-record.ts over a Cloudflare API double. Each logs
// its calls under $FAKE_STATE, records an unexpected call in $FAKE_STATE/unexpected, and records a Resend key that
// reaches its environment in $FAKE_STATE/key-in-env; terraform, gh and aws are never expected.
const keyInEnv = `[[ -z "\${RESEND_FULL_ACCESS_KEY:-}" ]] || printf '%s\\n' "$(basename "$0")" >> "$FAKE_STATE/key-in-env"`
const logged = (body: string) =>
  `#!/usr/bin/env bash\n${keyInEnv}\nprintf '%s\\n' "$*" >> "$FAKE_STATE/$(basename "$0").calls"\n${body}\n`
const neverExpected = logged(`printf '%s %s\\n' "$(basename "$0")" "$*" >> "$FAKE_STATE/unexpected"\nexit 97`)

function sandbox(overrides: Partial<Behaviour> = {}) {
  const behaviour: Behaviour = {
    recordNames: 'zone',
    sendingRecords: 'mx-txt',
    receivingMx: 'inbound-smtp.ap-northeast-1.amazonaws.com',
    verifyAfter: 1,
    secrets: ['RESEND_API_KEY', 'RESEND_RECEIVING_API_KEY', 'RESEND_WEBHOOK_SECRET'],
    ...overrides
  }
  const dir = plantRepo({
    'bin/curl': logged(`exec python3 ${fake('resend-api.py')} "$@"`),
    'bin/gcloud': logged(`exec python3 ${fake('secret-manager.py')} "$@"`),
    'bin/bun': logged(`exec ${realBun()} --preload ${fake('cloudflare-api.ts')} "$@"`),
    'bin/sleep': logged(''),
    'bin/open': logged(''),
    'bin/terraform': neverExpected,
    'bin/gh': neverExpected,
    'bin/aws': neverExpected,
    'tfvars.tf': TFVARS
  })
  const bin = join(dir, 'bin')
  for (const tool of readdirSync(bin)) chmodSync(join(bin, tool), 0o755)
  for (const tool of UTILITIES) symlinkSync(systemTool(tool), join(bin, tool))
  const state = join(dir, 'state')
  mkdirSync(join(state, 'secrets'), { recursive: true })
  writeFileSync(
    join(state, 'config.json'),
    JSON.stringify({
      fullKey: FULL_KEY,
      sendingOnlyKey: SENDING_ONLY_KEY,
      workerUrl: WORKER_URL,
      dkim: DKIM,
      ...behaviour
    })
  )
  writeFileSync(
    join(state, 'cloudflare.json'),
    JSON.stringify({ next: 1, records: SES_RECORDS.map((record, n) => ({ ...record, id: `ses-${n}` })) })
  )
  const read = (name: string) => (existsSync(join(state, name)) ? readFileSync(join(state, name), 'utf8') : '')
  const lines = (name: string) => read(name).split('\n').filter(Boolean)

  return {
    dir,
    state,
    /** Seeds Resend's account, before the first run. */
    seedResend: (account: Record<string, unknown>) =>
      writeFileSync(
        join(state, 'resend.json'),
        JSON.stringify({ n: 100, domains: [], webhooks: [], keys: [], ...account })
      ),
    /** Adds records to Cloudflare, each as the record script would have entered it. */
    seedCloudflare: (records: ReturnType<typeof ses>[]) => {
      const current = JSON.parse(read('cloudflare.json')) as { next: number; records: object[] }
      current.records.push(...records.map((record, n) => ({ ...record, id: `seed-${n}` })))
      writeFileSync(join(state, 'cloudflare.json'), JSON.stringify(current))
    },
    /** Changes how the Resend double behaves, for the next run. */
    configure: (changes: Partial<Behaviour>) => {
      const current = JSON.parse(read('config.json')) as object
      writeFileSync(join(state, 'config.json'), JSON.stringify({ ...current, ...changes }))
    },
    seedSecret: (name: string, value: string) => {
      mkdirSync(join(state, 'secrets', name), { recursive: true })
      writeFileSync(join(state, 'secrets', name, '1'), value)
    },
    secret: (name: string) => {
      const directory = join(state, 'secrets', name)
      const versions = existsSync(directory) ? readdirSync(directory).sort((a, b) => Number(a) - Number(b)) : []
      return versions.map((version) => readFileSync(join(directory, version), 'utf8'))
    },
    resend: () => JSON.parse(read('resend.json') || '{"domains":[],"webhooks":[],"keys":[]}'),
    cloudflare: () =>
      JSON.parse(read('cloudflare.json')).records as {
        type: string
        name: string
        content: string
        priority?: number
      }[],
    /** Every request the Resend double has seen so far, parsed. */
    requests: () =>
      lines('resend.calls').map(
        (line) => JSON.parse(line) as { method: string; path: string; query: string; body: unknown }
      ),
    writes: () =>
      lines('resend.calls')
        .map((line) => JSON.parse(line) as { method: string; path: string; body: unknown })
        .filter((call) => call.method !== 'GET'),
    bun: () => lines('bun.calls'),
    cloudflareWrites: () => lines('cloudflare.calls').filter((line) => !line.startsWith('GET ')),
    gcloud: () => lines('gcloud.calls'),
    run(options: { input: string[]; env?: Record<string, string | undefined> }) {
      const before = {
        requests: lines('resend.calls').length,
        cloudflare: lines('cloudflare.calls').length,
        gcloud: lines('gcloud.calls').length,
        bun: lines('bun.calls').length
      }
      const inherited = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => ['LANG', 'LC_ALL'].includes(key))
      )
      const env: Record<string, string> = {
        ...inherited,
        PATH: bin,
        HOME: dir,
        FAKE_STATE: state,
        ENV_FILE: join(dir, 'wizard.env'),
        TFVARS_FILE: join(dir, 'tfvars.tf'),
        M1KU_CLOUDFLARE_API_TOKEN: CLOUDFLARE_TOKEN,
        RESEND_FULL_ACCESS_KEY: FULL_KEY
      }
      for (const [key, value] of Object.entries(options.env ?? {})) {
        if (value === undefined) delete env[key]
        else env[key] = value
      }
      const result = spawnSync(join(bin, 'bash'), [wizardPath], {
        cwd: repoRoot,
        input: `${options.input.join('\n')}\n`,
        encoding: 'utf8',
        timeout: 90_000,
        env
      })
      expect(result.error, 'the run timed out or could not start').toBeUndefined()
      expect(read('unexpected'), 'a call no stand-in answers').toBe('')
      expect(read('key-in-env'), 'a Resend key in a child process environment').toBe('')
      expect(result.stderr, 'a shell error').not.toMatch(
        /command not found|unbound variable|syntax error|bad substitution/
      )
      const output = result.stdout + result.stderr
      // No secret reaches the screen.
      for (const secret of [FULL_KEY, SENDING_ONLY_KEY, 're_sending', 'whsec_', CLOUDFLARE_TOKEN]) {
        expect(output, `${secret} on the screen`).not.toContain(secret)
      }
      return {
        result,
        output,
        // This run's calls only.
        requests: lines('resend.calls')
          .slice(before.requests)
          .map((line) => JSON.parse(line) as { method: string; path: string; body: unknown }),
        cloudflareCalls: lines('cloudflare.calls').slice(before.cloudflare),
        gcloudCalls: lines('gcloud.calls').slice(before.gcloud),
        bunCalls: lines('bun.calls').slice(before.bun)
      }
    }
  }
}

// One pause per stage, then the confirmation the DNS stage asks when something would change.
const PAUSE = ''
const mainPath = [PAUSE, PAUSE, PAUSE, PAUSE, 'y', PAUSE, PAUSE, PAUSE, PAUSE]
// A run that finds everything done asks nothing but the pauses.
const nothingToDo = [PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE]
const writesOf = <T extends { method: string }>(calls: T[]) => calls.filter((call) => call.method !== 'GET')

describe('infra/wizards/resend.sh static invariants', () => {
  test('copies the /wizard library verbatim, is executable, passes bash -n and shellcheck, and never hard-codes a record', () => {
    accessSync(wizardPath, constants.X_OK)
    const wizard = readFileSync(wizardPath, 'utf8')
    const template = readFileSync(templatePath, 'utf8')

    const marker = '# STAGES:'
    expect(wizard.slice(0, wizard.indexOf(marker))).toBe(template.slice(0, template.indexOf(marker)))

    const stagesSection = wizard.slice(wizard.indexOf('run_wizard() {'))
    const declaredTotal = Number(stagesSection.match(/^\s*TOTAL_STAGES=(\d+)/m)?.[1] ?? 0)
    expect(declaredTotal).toBeGreaterThan(0)
    expect([...stagesSection.matchAll(/^\s*stage\s+"/gm)].length).toBe(declaredTotal)

    // Keys never persist to ENV_FILE and never reach argv; the other clouds and Terraform are never run.
    expect(stagesSection).not.toMatch(/write_env/)
    expect(wizard).not.toMatch(/curl[^\n]*(FULL_ACCESS_KEY|RESEND_API_KEY)/)
    expect(wizard).not.toMatch(/^\s*(terraform|gh|aws)\s/m)
    // Names, values and priorities of DNS records come from Resend's answer at run time.
    expect(wizard).not.toMatch(/amazonses|amazonaws|feedback-smtp|inbound-smtp|resend\._domainkey|rmta\.net/)

    const bashCheck = spawnSync('bash', ['-n', wizardPath], { cwd: repoRoot, encoding: 'utf8' })
    expect(bashCheck.status, bashCheck.stderr).toBe(0)

    // CI's shellcheck 0.9.0 reports SC2317 (info, "unreachable") for the library's functions, which are
    // called through the stage runner and traps; 0.11 doesn't. Every other code must be clean.
    const shellcheck = spawnSync('shellcheck', ['--exclude=SC2317', 'infra/wizards/resend.sh'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
    expect(shellcheck.status, shellcheck.stdout + shellcheck.stderr).toBe(0)
  })
})

describe('infra/wizards/resend.sh on an account with nothing set up', () => {
  const box = sandbox()
  box.seedSecret('SKYCLAUSE_STAFF_EMAILS', 'unrelated')
  const first = box.run({ input: mainPath })

  test('finishes, and its only writes to Resend are the setup', () => {
    expect(first.result.status, first.output).toBe(0)
    expect(
      writesOf(first.requests).map(
        (call) => `${call.method} ${call.path.replace(/[0-9a-f]{8}-0000-4000-8000-\d{12}/, '<id>')}`
      )
    ).toEqual([
      'POST /domains',
      'POST /domains',
      'POST /domains/<id>/verify',
      'POST /domains/<id>/verify',
      'POST /webhooks',
      'POST /api-keys'
    ])
  })

  test('creates the sending and the receive-only domain in Tokyo with open and click tracking off', () => {
    const bodies = first.requests
      .filter((call) => call.method === 'POST' && call.path === '/domains')
      .map((call) => call.body)
    expect(bodies).toEqual([
      {
        name: SENDING,
        region: 'ap-northeast-1',
        open_tracking: false,
        click_tracking: false,
        capabilities: { sending: 'enabled', receiving: 'disabled' }
      },
      {
        name: RECEIVING,
        region: 'ap-northeast-1',
        open_tracking: false,
        click_tracking: false,
        capabilities: { sending: 'disabled', receiving: 'enabled' }
      }
    ])
  })

  test('enters the records Resend returned, replaces the in. MX and rewrites DMARC without its report address', () => {
    const records = box
      .cloudflare()
      .map((record) => `${record.type} ${record.name} ${record.priority ? `${record.priority} ` : ''}${record.content}`)
    expect(records).toEqual(
      expect.arrayContaining([
        `TXT resend._domainkey.notices.skyclause.m1ku.tech ${DKIM}`,
        'MX send.notices.skyclause.m1ku.tech 10 feedback-smtp.ap-northeast-1.amazonses.com',
        `TXT send.notices.skyclause.m1ku.tech ${SPF}`,
        `TXT resend._domainkey.in.skyclause.m1ku.tech ${DKIM}`,
        'MX in.skyclause.m1ku.tech 10 inbound-smtp.ap-northeast-1.amazonaws.com',
        'TXT _dmarc.notices.skyclause.m1ku.tech v=DMARC1; p=quarantine'
      ])
    )
    expect(box.cloudflare().filter((record) => record.type === 'MX' && record.name === RECEIVING)).toHaveLength(1)
    expect(box.cloudflare().filter((record) => record.name.startsWith('_dmarc.'))).toHaveLength(1)
    expect(first.output).toContain('This replaces the MX at in.skyclause.m1ku.tech')
  })

  test('leaves every other SES record exactly as it was, and writes only through the record script', () => {
    const untouched = SES_RECORDS.filter((record) => !(record.name === RECEIVING || record.name.startsWith('_dmarc.')))
    for (const record of untouched) {
      expect(box.cloudflare()).toContainEqual(
        expect.objectContaining({ type: record.type, name: record.name, content: record.content })
      )
    }
    expect(box.cloudflare()).toHaveLength(SES_RECORDS.length + 4)
    // Six dry runs, then the six writes, each by the record script.
    expect(first.bunCalls).toHaveLength(12)
    expect(first.bunCalls.every((call) => call.startsWith('scripts/cloudflare-record.ts '))).toBe(true)
    expect(first.bunCalls.slice(0, 6).every((call) => call.includes(' --dry-run '))).toBe(true)
    // DMARC goes before the MX swap, so no report is addressed to Resend's quota.
    expect(first.bunCalls[0]).toContain('TXT _dmarc.notices.skyclause.m1ku.tech')
    expect(
      first.bunCalls.findIndex((call) => call.includes(' MX in.skyclause.m1ku.tech ') && !call.includes('--dry-run'))
    ).toBeGreaterThan(first.bunCalls.findIndex((call) => call.includes('_dmarc') && !call.includes('--dry-run')))
    expect(first.bunCalls.slice(6).some((call) => call.includes('--dry-run'))).toBe(false)
  })

  test('waits for verification, then creates the webhook on the worker route with the five events', () => {
    const hook = first.requests.find((call) => call.method === 'POST' && call.path === '/webhooks')
    expect(hook?.body).toEqual({ endpoint: `${WORKER_URL}/resend/webhook`, events: EVENTS })
    const order = first.requests.map(
      (call) => `${call.method} ${call.path.replace(/[0-9a-f]{8}-0000-4000-8000-\d{12}/, '<id>')}`
    )
    expect(order.lastIndexOf('GET /domains/<id>')).toBeLessThan(order.indexOf('POST /webhooks'))
  })

  test('creates a sending-only key restricted to the sending domain', () => {
    const sendingId = box.resend().domains.find((domain: { name: string }) => domain.name === SENDING).id
    const key = first.requests.find((call) => call.method === 'POST' && call.path === '/api-keys')
    expect(key?.body).toEqual({
      name: 'skyclause-production-sending',
      permission: 'sending_access',
      domain_id: sendingId
    })
  })

  test('stores the three secrets in Secret Manager and prints the supplied_secrets line to commit', () => {
    const state = box.resend()
    expect(box.secret('RESEND_API_KEY')).toEqual([state.keys[0].token])
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toEqual([state.webhooks[0].signing_secret])
    expect(box.secret('RESEND_RECEIVING_API_KEY')).toEqual([FULL_KEY])
    expect(box.secret('SKYCLAUSE_STAFF_EMAILS')).toEqual(['unrelated'])
    expect(first.output).toContain(ALL_SUPPLIED)
  })

  test('hands the key to curl over stdin only, never on a command line', () => {
    expect(readFileSync(join(box.state, 'curl.stdin'), 'utf8')).toContain(`Authorization: Bearer ${FULL_KEY}`)
    for (const log of ['curl.calls', 'gcloud.calls', 'bun.calls', 'open.calls']) {
      const path = join(box.state, log)
      if (existsSync(path)) expect(readFileSync(path, 'utf8')).not.toMatch(/re_|whsec_/)
    }
  })

  test('a second run changes nothing: no write to Resend, Cloudflare or Secret Manager', () => {
    const again = box.run({ input: nothingToDo })

    expect(again.result.status, again.output).toBe(0)
    expect(writesOf(again.requests)).toEqual([])
    expect(again.cloudflareCalls.filter((call) => !call.startsWith('GET '))).toEqual([])
    expect(again.bunCalls.filter((call) => !call.includes('--dry-run'))).toEqual([])
    expect(again.gcloudCalls.filter((call) => call.startsWith('secrets versions add'))).toEqual([])
    expect(box.secret('RESEND_API_KEY')).toHaveLength(1)
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toHaveLength(1)
    expect(box.secret('RESEND_RECEIVING_API_KEY')).toHaveLength(1)
    expect(again.output).toContain('Every record is already in Cloudflare.')
    expect(again.output).toContain(`supplied_secrets = [`)
  })
})

describe("infra/wizards/resend.sh takes Resend's records as they come", () => {
  test('enters records named relative to the domain, a CNAME sending record and another receiving MX host', () => {
    const box = sandbox({ recordNames: 'domain', sendingRecords: 'cname', receivingMx: 'receive.forge.rmta.net' })
    const run = box.run({ input: mainPath })

    expect(run.result.status, run.output).toBe(0)
    const records = box
      .cloudflare()
      .map((record) => `${record.type} ${record.name} ${record.priority ? `${record.priority} ` : ''}${record.content}`)
    expect(records).toEqual(
      expect.arrayContaining([
        `TXT resend._domainkey.notices.skyclause.m1ku.tech ${DKIM}`,
        'CNAME send.notices.skyclause.m1ku.tech cname-target.resend-test.example',
        `TXT resend._domainkey.in.skyclause.m1ku.tech ${DKIM}`,
        'MX in.skyclause.m1ku.tech 10 receive.forge.rmta.net'
      ])
    )
    expect(records.some((record) => record.startsWith('MX send.notices'))).toBe(false)
  })

  test('lists a record type the record script cannot write, and carries on', () => {
    const extraRecord = {
      record: 'TrackingCAA',
      name: 'notices.skyclause',
      type: 'CAA',
      value: '0 issue "amazon.com"',
      ttl: 'Auto'
    }
    const box = sandbox({ extraRecord })
    const run = box.run({ input: mainPath })

    expect(run.result.status, run.output).toBe(0)
    expect(run.output).toContain(
      'enter the CAA record notices.skyclause.m1ku.tech with content \'0 issue "amazon.com"\' by hand'
    )
    expect(box.cloudflare().some((record) => record.type === 'CAA')).toBe(false)
  })
})

describe('infra/wizards/resend.sh stops before it writes anything it should not', () => {
  test('refuses a key that can only send, after one read', () => {
    const box = sandbox()
    const run = box.run({ input: [PAUSE, PAUSE], env: { RESEND_FULL_ACCESS_KEY: SENDING_ONLY_KEY } })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('That key can only send mail')
    expect(run.requests).toHaveLength(1)
  })

  test('asks for the key at a hidden prompt when the environment has none, and refuses a malformed one', () => {
    const box = sandbox()
    const run = box.run({
      input: [PAUSE, PAUSE, 'not-a-key', FULL_KEY, PAUSE, PAUSE, 'y', PAUSE, PAUSE, PAUSE, PAUSE],
      env: { RESEND_FULL_ACCESS_KEY: undefined }
    })

    expect(run.result.status, run.output).toBe(0)
    expect(run.output).toContain('Paste the whole key')
    expect(box.secret('RESEND_RECEIVING_API_KEY')).toEqual([FULL_KEY])
  })

  test('stops at the start when Terraform has not made a secret, before any call to Resend', () => {
    const box = sandbox({ secrets: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'] })
    const run = box.run({ input: [PAUSE, PAUSE] })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('Secret Manager has no RESEND_RECEIVING_API_KEY in skyclause')
    expect(run.requests).toEqual([])
  })

  test('stops at the start without the Cloudflare token', () => {
    const box = sandbox()
    const run = box.run({ input: [PAUSE, PAUSE], env: { M1KU_CLOUDFLARE_API_TOKEN: undefined } })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('M1KU_CLOUDFLARE_API_TOKEN')
    expect(run.requests).toEqual([])
  })

  test('stops on a domain in another region, because Resend cannot move one', () => {
    const box = sandbox()
    box.seedResend({
      domains: [
        {
          id: 'domain-1',
          name: SENDING,
          status: 'verified',
          created_at: '2026-11-10 08:00:00.000000+00',
          region: 'us-east-1',
          open_tracking: false,
          click_tracking: false,
          capabilities: { sending: 'enabled', receiving: 'disabled' }
        }
      ]
    })
    const run = box.run({ input: [PAUSE, PAUSE, PAUSE] })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('is in us-east-1, not ap-northeast-1')
    expect(writesOf(run.requests)).toEqual([])
  })

  test('switches tracking off on an existing domain that has it on', () => {
    const box = sandbox()
    box.seedResend({
      domains: [
        {
          id: 'domain-1',
          name: SENDING,
          status: 'verified',
          created_at: '2026-11-10 08:00:00.000000+00',
          region: 'ap-northeast-1',
          open_tracking: true,
          click_tracking: false,
          capabilities: { sending: 'enabled', receiving: 'disabled' }
        }
      ]
    })
    const run = box.run({ input: mainPath })

    expect(run.result.status, run.output).toBe(0)
    expect(run.requests.find((call) => call.method === 'PATCH')).toMatchObject({
      method: 'PATCH',
      path: '/domains/domain-1',
      body: { open_tracking: false, click_tracking: false, capabilities: { sending: 'enabled', receiving: 'disabled' } }
    })
    expect(run.requests.filter((call) => call.method === 'POST' && call.path === '/domains')).toHaveLength(1)
  })

  test('does not write DNS when the replacement is declined', () => {
    const box = sandbox()
    const run = box.run({ input: [PAUSE, PAUSE, PAUSE, PAUSE, 'n'] })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('Nothing written.')
    expect(box.cloudflareWrites()).toEqual([])
    expect(box.secret('RESEND_API_KEY')).toEqual([])
  })

  test('stops on a failed verification, before the webhook, the key and the secrets', () => {
    const box = sandbox({ verifyOutcome: 'failed' })
    const run = box.run({ input: mainPath })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('Resend marked notices.skyclause.m1ku.tech failed')
    expect(run.requests.some((call) => call.path === '/webhooks' || call.path === '/api-keys')).toBe(false)
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toEqual([])
  })
})

describe('infra/wizards/resend.sh finds what exists', () => {
  const verifiedDomains = ['notices', 'in'].map((label, n) => ({
    id: `domain-${n + 1}`,
    name: `${label}.skyclause.m1ku.tech`,
    status: 'verified',
    created_at: '2026-11-10 08:00:00.000000+00',
    region: 'ap-northeast-1',
    open_tracking: false,
    click_tracking: false,
    capabilities:
      label === 'notices'
        ? { sending: 'enabled', receiving: 'disabled' }
        : { sending: 'disabled', receiving: 'enabled' }
  }))
  const hook = (overrides: Record<string, unknown> = {}) => ({
    id: 'hook-1',
    endpoint: `${WORKER_URL}/resend/webhook`,
    events: EVENTS,
    status: 'enabled',
    created_at: '2026-11-10T08:00:00.000Z',
    signing_secret: 'whsec_existing',
    ...overrides
  })
  const key = {
    id: 'key-1',
    name: 'skyclause-production-sending',
    created_at: '2026-11-10T08:00:00.000Z',
    last_used_at: null,
    token: 're_sending_existing'
  }
  // Domains verified, so the DNS stage has only DMARC to check; one pause fewer than a full run asks.
  const verified = [PAUSE, PAUSE, PAUSE, PAUSE, 'y', PAUSE, PAUSE, PAUSE]

  test('puts a webhook with the wrong events and a disabled status right, and reads its secret from Resend', () => {
    const box = sandbox()
    box.seedResend({
      domains: verifiedDomains,
      webhooks: [hook({ events: ['email.sent'], status: 'disabled' })],
      keys: [key]
    })
    box.seedSecret('RESEND_API_KEY', 're_sending_existing')
    const run = box.run({ input: [...verified, PAUSE] })

    expect(run.result.status, run.output).toBe(0)
    expect(run.requests.find((call) => call.method === 'PATCH' && call.path === '/webhooks/hook-1')?.body).toEqual({
      events: EVENTS,
      status: 'enabled'
    })
    expect(writesOf(run.requests).some((call) => call.path === '/webhooks' && call.method === 'POST')).toBe(false)
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toEqual(['whsec_existing'])
    expect(box.secret('RESEND_API_KEY')).toEqual(['re_sending_existing'])
  })

  test('keeps a key it cannot recover the token of, until it is told to replace it', () => {
    const box = sandbox()
    box.seedResend({ domains: verifiedDomains, webhooks: [hook()], keys: [key] })
    const declined = box.run({ input: [...verified, 'n'] })

    expect(declined.result.status).toBe(1)
    expect(declined.output).toContain("RESEND_API_KEY doesn't hold a live token")
    expect(writesOf(declined.requests).filter((call) => call.path.startsWith('/api-keys'))).toEqual([])
    expect(box.secret('RESEND_API_KEY')).toEqual([])

    // The first run already put the DMARC record right, so this one asks nothing in the DNS stage.
    const accepted = box.run({ input: [...nothingToDo.slice(0, 7), 'y', PAUSE] })

    expect(accepted.result.status, accepted.output).toBe(0)
    expect(writesOf(accepted.requests).map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api-keys/key-1',
      'POST /api-keys'
    ])
    expect(box.secret('RESEND_API_KEY')).toHaveLength(1)
  })

  test('asks before replacing a secret whose value differs, and leaves it when told no', () => {
    const box = sandbox()
    box.seedResend({ domains: verifiedDomains, webhooks: [hook()], keys: [key] })
    box.seedSecret('RESEND_API_KEY', 're_sending_existing')
    box.seedSecret('RESEND_WEBHOOK_SECRET', 'whsec_stale')
    const run = box.run({ input: [...verified, 'n'] })

    expect(run.result.status, run.output).toBe(0)
    expect(run.output).toContain('RESEND_WEBHOOK_SECRET holds a different value')
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toEqual(['whsec_stale'])
    expect(run.output).toContain('RESEND_WEBHOOK_SECRET: Secret Manager holds a value that differs')
  })

  test('replaces a stored sending key that Resend no longer accepts', () => {
    const box = sandbox()
    box.seedResend({ domains: verifiedDomains, webhooks: [hook()], keys: [key] })
    box.seedSecret('RESEND_API_KEY', 're_sending_deleted_long_ago')
    const run = box.run({ input: [...verified, 'y', PAUSE] })

    expect(run.result.status, run.output).toBe(0)
    expect(writesOf(run.requests).map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api-keys/key-1',
      'POST /api-keys'
    ])
    expect(box.secret('RESEND_API_KEY')).toHaveLength(2)
  })

  test('asks whose account it is when the account already holds other domains', () => {
    const box = sandbox()
    box.seedResend({ domains: [{ ...verifiedDomains[0], id: 'domain-9', name: 'someone-else.example' }] })
    const declined = box.run({ input: [PAUSE, PAUSE, 'n'] })

    expect(declined.result.status).toBe(1)
    expect(declined.output).toContain('This Resend account also holds: someone-else.example.')
    expect(writesOf(declined.requests)).toEqual([])

    const accepted = box.run({ input: [PAUSE, PAUSE, 'y', PAUSE, PAUSE, 'y', PAUSE, PAUSE, PAUSE, PAUSE] })
    expect(accepted.result.status, accepted.output).toBe(0)
  })

  test('says supplied_secrets already lists all three when it does', () => {
    const box = sandbox()
    writeFileSync(join(box.dir, 'tfvars.tf'), `${ALL_SUPPLIED}\n`)
    const run = box.run({ input: mainPath })

    expect(run.result.status, run.output).toBe(0)
    expect(run.output).toContain('already lists all three')
    expect(run.output).not.toContain('Commit this line')
  })
})

describe('infra/wizards/resend.sh resumes and refuses', () => {
  test('a run that stopped while the domains were pending is finished by the next, without writing the DNS again', () => {
    const box = sandbox({ verifyAfter: 1000 })
    // 40 checks later it offers to stop waiting, and the person does.
    const stopped = box.run({ input: [PAUSE, PAUSE, PAUSE, PAUSE, 'y', PAUSE, 'n'] })

    expect(stopped.result.status).toBe(1)
    expect(stopped.output).toContain('is still pending after 10 minutes')
    expect(box.cloudflare()).toHaveLength(SES_RECORDS.length + 4)
    expect(box.resend().domains.map((domain: { status: string }) => domain.status)).toEqual(['pending', 'not_started'])

    box.configure({ verifyAfter: 1 })
    const resumed = box.run({ input: [PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE, PAUSE] })

    expect(resumed.result.status, resumed.output).toBe(0)
    expect(resumed.requests.filter((call) => call.method === 'POST' && call.path === '/domains')).toEqual([])
    expect(resumed.bunCalls.filter((call) => !call.includes('--dry-run'))).toEqual([])
    expect(box.resend().webhooks).toHaveLength(1)
    expect(box.secret('RESEND_RECEIVING_API_KEY')).toEqual([FULL_KEY])
  })

  test('writes nothing when Cloudflare refuses a record at the dry run', () => {
    const box = sandbox()
    box.seedCloudflare([
      {
        type: 'TXT',
        name: 'send.notices.skyclause.m1ku.tech',
        content: 'someone else',
        priority: undefined,
        proxied: undefined,
        comment: 'owner: another-project'
      }
    ])
    const run = box.run({ input: mainPath })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain('whose comment is not owner: skyclause')
    expect(box.cloudflareWrites()).toEqual([])
    expect(box.secret('RESEND_WEBHOOK_SECRET')).toEqual([])
  })

  test('refuses to replace any existing record but the in. MX and the DMARC record', () => {
    const box = sandbox()
    // A different SPF record at the name Resend wants: the record script would replace it.
    box.seedCloudflare([ses('TXT', 'send.notices.skyclause.m1ku.tech', 'v=spf1 include:example.org ~all')])
    const run = box.run({ input: mainPath })

    expect(run.result.status).toBe(1)
    expect(run.output).toContain(
      'Cloudflare already has a TXT record at send.notices.skyclause.m1ku.tech with other content'
    )
    expect(box.cloudflareWrites()).toEqual([])
    expect(box.cloudflare()).toContainEqual(
      expect.objectContaining({ name: 'send.notices.skyclause.m1ku.tech', content: 'v=spf1 include:example.org ~all' })
    )
  })
})
