import { spawnSync } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const wizardPath = fileURLToPath(new URL('../infra/wizards/staff-emails.sh', import.meta.url))
const templatePath = fileURLToPath(new URL('../.agents/skills/wizard/template.sh', import.meta.url))

// gcloud answers only what the wizard asks of Secret Manager and keeps the stored value in $FAKE_STATE/stored;
// aws, terraform and gh are never expected, and any call to one is recorded in $FAKE_STATE/unexpected.
const fakeGcloud = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_STATE/gcloud.calls"
case "$*" in
  "config get-value account") echo owner@example.org ;;
  "secrets describe "*) ;;
  "secrets versions list "*) ;;
  "secrets versions add "*) cat > "$FAKE_STATE/stored" ;;
  *) printf 'gcloud %s\\n' "$*" >> "$FAKE_STATE/unexpected"; exit 97 ;;
esac
`
const neverExpected = `#!/usr/bin/env bash\nprintf '%s %s\\n' "$(basename "$0")" "$*" >> "$FAKE_STATE/unexpected"\nexit 97\n`

const SYSTEM_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
function systemTool(name: string) {
  const dir = SYSTEM_DIRS.find((candidate) => existsSync(join(candidate, name)))
  if (!dir) throw new Error(`${name} is needed to run the wizard's tests`)
  return realpathSync(join(dir, name))
}

function runWizard(input: string[]) {
  const dir = plantRepo({
    'bin/gcloud': fakeGcloud,
    'bin/aws': neverExpected,
    'bin/terraform': neverExpected,
    'bin/gh': neverExpected,
    'state/.keep': ''
  })
  const bin = join(dir, 'bin')
  for (const tool of readdirSync(bin)) chmodSync(join(bin, tool), 0o755)
  for (const tool of ['bash', 'cat', 'grep', 'mktemp', 'rm', 'dirname']) symlinkSync(systemTool(tool), join(bin, tool))
  const state = join(dir, 'state')
  const result = spawnSync(join(bin, 'bash'), [wizardPath], {
    cwd: repoRoot,
    input: `${input.join('\n')}\n`,
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: bin, HOME: dir, FAKE_STATE: state, ENV_FILE: join(dir, 'wizard.env') }
  })
  const read = (name: string) => (existsSync(join(state, name)) ? readFileSync(join(state, name), 'utf8') : '')
  expect(result.error, 'the run timed out or could not start').toBeUndefined()
  expect(read('unexpected'), 'a call no stand-in answers').toBe('')
  return { result, output: result.stdout + result.stderr, stored: read('stored'), gcloud: read('gcloud.calls') }
}

describe('infra/wizards/staff-emails.sh', () => {
  test('copies the /wizard library verbatim, is executable, passes bash -n and shellcheck, and has no SES half', () => {
    accessSync(wizardPath, constants.X_OK)
    const wizard = readFileSync(wizardPath, 'utf8')
    const template = readFileSync(templatePath, 'utf8')

    const marker = '# STAGES:'
    expect(wizard.slice(0, wizard.indexOf(marker))).toBe(template.slice(0, template.indexOf(marker)))

    const stagesSection = wizard.slice(wizard.indexOf('run_wizard() {'))
    const declaredTotal = Number(stagesSection.match(/^\s*TOTAL_STAGES=(\d+)/m)?.[1] ?? 0)
    expect([...stagesSection.matchAll(/^\s*stage\s+"/gm)].length).toBe(declaredTotal)

    expect(wizard).not.toMatch(/\bSES\b|\bses\b|sesv2|\baws\b|AWS/)

    const bashCheck = spawnSync('bash', ['-n', wizardPath], { cwd: repoRoot, encoding: 'utf8' })
    expect(bashCheck.status, bashCheck.stderr).toBe(0)

    // CI's shellcheck 0.9.0 reports SC2317 (info, "unreachable") for the library's functions; 0.11 doesn't.
    const shellcheck = spawnSync('shellcheck', ['--exclude=SC2317', 'infra/wizards/staff-emails.sh'], {
      cwd: repoRoot,
      encoding: 'utf8'
    })
    expect(shellcheck.status, shellcheck.stdout + shellcheck.stderr).toBe(0)
  })

  test('only stores the staff list, then says to list the secret in supplied_secrets', () => {
    const { result, output, stored, gcloud } = runWizard([
      '', // banner
      '', // stage 1
      'y', // store the staff addresses?
      'a@example.org, b@example.org' // the list
    ])

    expect(result.status, output).toBe(0)
    expect(stored).toBe('a@example.org,b@example.org')
    expect(gcloud).toContain('secrets versions add SKYCLAUSE_STAFF_EMAILS')
    expect(output).toContain('add "SKYCLAUSE_STAFF_EMAILS" to supplied_secrets')
    expect(output).not.toMatch(/SES|sandbox|verification/)
  })

  test('answering "n" stores nothing', () => {
    const { result, output, stored } = runWizard(['', '', 'n'])

    expect(result.status, output).toBe(0)
    expect(stored).toBe('')
  })
})
