import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadEnv } from '../packages/config/src/env'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./check-image.sh', import.meta.url))

// Stand-ins for docker, curl and sleep. docker records each detached run's arguments (one per line) and answers the
// calls check-image.sh makes; the one-off runs fail with the messages the script looks for. curl answers ok for the
// roles in FAKE_HEALTHY.
const fakeDocker = `#!/usr/bin/env bash
set -euo pipefail
port_of() { case "$1" in cid-web) echo 41001 ;; cid-worker) echo 41002 ;; *) echo 0 ;; esac; }
case "$1" in
  image) echo app ;;
  port) echo "0.0.0.0:$(port_of "$2")" ;;
  stop) echo "$2" ;;
  logs) echo 'fake log line' >&2 ;;
  run)
    if [ "$2" = -d ]; then
      role=$(printf '%s\\n' "$@" | sed -n 's/^K_SERVICE=//p')
      printf '%s\\n' "$@" > "$FAKE_LOG/$role.argv"
      echo "cid-$role"
    elif [[ " $* " == *" --entrypoint "* ]]; then
      echo 1000
    else
      case "$*" in
        *no-such-job*) echo 'unknown job no-such-job' ;;
        *from-args*) echo 'unknown job from-args;' ;;
        *APP_ENV=test*) echo 'APP_ENV=test is refused on Cloud Run' ;;
        *) echo 'K_SERVICE is not set' ;;
      esac >&2
      exit 1
    fi ;;
  *) echo "unexpected docker $*" >&2; exit 9 ;;
esac
`

const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail
case "\${!#}" in
  *:41001/health) role=web ;;
  *:41002/health) role=worker ;;
  *) exit 6 ;;
esac
case " $FAKE_HEALTHY " in *" $role "*) echo ok ;; *) exit 7 ;; esac
`

function runCheck(healthy: string) {
  const fake = plantRepo({
    'bin/docker': fakeDocker,
    'bin/curl': fakeCurl,
    'bin/sleep': '#!/usr/bin/env bash\nexit 0\n'
  })
  for (const name of ['docker', 'curl', 'sleep']) chmodSync(join(fake, 'bin', name), 0o755)
  const log = join(fake, 'log')
  mkdirSync(log)
  const result = spawnSync(script, ['skyclause-check:image'], {
    encoding: 'utf8',
    env: { PATH: `${join(fake, 'bin')}:${process.env.PATH}`, FAKE_LOG: log, FAKE_HEALTHY: healthy }
  })
  return { ...result, log }
}

// The -e NAME=value pairs a detached run of `role` was given.
function envOf(log: string, role: string) {
  const args = readFileSync(join(log, `${role}.argv`), 'utf8').split('\n')
  const env: Record<string, string> = {}
  args.forEach((arg, i) => {
    if (arg === '-e') {
      const [name = '', ...value] = (args[i + 1] ?? '').split('=')
      env[name] = value.join('=')
    }
  })
  return env
}

test('web gets a generated BETTER_AUTH_SECRET, and its environment satisfies loadEnv', () => {
  const env = envOf(runCheck('web worker').log, 'web')
  expect(env.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32)
  expect(() => loadEnv('web', env)).not.toThrow()
})

test('the secret is generated per run, not a committed value', () => {
  const first = envOf(runCheck('web worker').log, 'web').BETTER_AUTH_SECRET
  const second = envOf(runCheck('web worker').log, 'web').BETTER_AUTH_SECRET
  expect(first).toBeDefined()
  expect(first).not.toBe(second)
})

test('the secret never reaches the script output', () => {
  const run = runCheck('web worker')
  const secret = envOf(run.log, 'web').BETTER_AUTH_SECRET
  expect(secret).toBeDefined()
  expect(run.stdout + run.stderr).not.toContain(secret)
})

test('worker, with its environment, satisfies loadEnv', () => {
  expect(() => loadEnv('worker', envOf(runCheck('web worker').log, 'worker'))).not.toThrow()
})

test('passes when web and worker answer /health', () => {
  const run = runCheck('web worker')
  expect(run.status, run.stderr).toBe(0)
  expect(run.stdout).toContain('ok   web answers /health')
})

test('fails and names web when web does not answer /health', () => {
  const run = runCheck('worker')
  expect(run.status).toBe(1)
  expect(run.stderr).toContain("FAIL: web didn't answer /health with ok")
})
