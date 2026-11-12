import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const workflow = Bun.YAML.parse(
  readFileSync(join(import.meta.dir, '..', '.github', 'workflows', 'pilot-deploy.yml'), 'utf8')
) as { jobs: Record<string, { steps: { run?: string }[] }> }

const variables = {
  PILOT_SCRIPT_ID: 'stub-script-id',
  INGEST_DEPLOYMENT_ID: 'stub-deployment-id',
  INGEST_URL: 'https://script.google.com/macros/s/stub-deployment-id/exec',
  DEPLOY_FREEZE: 'false'
}

// Stub gh, bun and bunx log each call to $STUB_DIR/log; what they see goes to $STUB_DIR/seen.
const stubs = {
  git: `if [ "$1" = "\${STUB_GIT_FAIL:-}" ] &&
  { [ "\${STUB_GIT_FAIL_AFTER_CHECKS:-}" != true ] || grep -qx 'bun test' "$STUB_DIR/log"; }; then
  echo "fatal: cannot inspect $1" >&2
  exit 9
fi
exec "$STUB_REAL_GIT" "$@"`,
  gh: `printf 'gh %s\\n' "$*" >> "$STUB_DIR/log"
case "$1 $2" in
  'auth status') exit 0 ;;
  'variable list')
    [ -z "\${STUB_GH_FAIL:-}" ] || { echo 'HTTP 502' >&2; exit 1; }
    while [ $# -gt 0 ]; do
      if [ "$1" = --jq ]; then printf '%s' "$STUB_VARIABLES" | jq -r "$2"; exit; fi
      shift
    done ;;
esac
exit 1`,
  bun: `printf 'bun %s\\n' "$*" >> "$STUB_DIR/log"
case "$*" in
  test) [ -z "\${STUB_TEST_WRITES:-}" ] || echo changed > "$STUB_TEST_WRITES" ;;
  'pilot/apps-script/build.ts')
    printf 'build PILOT_SCRIPT_ID=%s GITHUB_SHA=%s\\n' "\${PILOT_SCRIPT_ID:-}" "\${GITHUB_SHA:-}" >> "$STUB_DIR/seen" ;;
  'pilot/apps-script/deployed.ts scope-guard')
    printf 'scope-guard INGEST_URL=%s\\n' "\${INGEST_URL:-}" >> "$STUB_DIR/seen"
    exit "\${STUB_SCOPE_GUARD_EXIT:-0}" ;;
  'pilot/apps-script/deployed.ts await-sha '*)
    [ "\${STUB_AWAIT_EXIT:-0}" = 0 ] || exit "$STUB_AWAIT_EXIT"
    printf '{\\n  "ok": true,\\n  "sha": "%s"\\n}\\n' "$3" ;;
esac`,
  bunx: `printf 'bunx %s\\n' "$*" >> "$STUB_DIR/log"
[ "$1" = @google/clasp@3.4.1 ] || exit 0
printf '%s\\n' "$HOME" >> "$STUB_DIR/homes"
case "$*" in
  *' login') printf '{"token":"stub-secret-token"}' > "$HOME/.clasprc.json" ;;
  *' --json show-authorized-user') printf '{"email":"%s"}\\n' "$STUB_LOGIN_EMAIL" ;;
  *)
    # Real clasp needs the login's token in this HOME.
    [ -f "$HOME/.clasprc.json" ] || exit 1
    if [ "$2" = -P ]; then printf 'project %s\\n' "$(cat "$3")" >> "$STUB_DIR/seen"; fi ;;
esac`
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(
    [
      'git',
      '-c',
      'user.name=Deploy test',
      '-c',
      'user.email=deploy@example.test',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args
    ],
    { cwd }
  )
  expect(result.exitCode).toBe(0)
  return result.stdout.toString().trim()
}

// A checkout of a one-commit main with pilot/deploy.sh, pushed to a local origin, and stubs on PATH.
function checkout() {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-deploy-'))
  dirs.push(dir)
  const work = join(dir, 'work')
  const bin = join(dir, 'bin')
  git(dir, 'init', '-q', '--bare', '-b', 'main', 'origin.git')
  git(dir, 'init', '-q', '-b', 'main', 'work')
  mkdirSync(join(work, 'pilot/apps-script'), { recursive: true })
  mkdirSync(join(work, 'pilot/workflows'), { recursive: true })
  writeFileSync(join(work, 'pilot/workflows/ge-setup.sh'), '# tracked workflow setup\n')
  copyFileSync(join(import.meta.dir, 'deploy.sh'), join(work, 'pilot/deploy.sh'))
  writeFileSync(join(work, 'pilot/apps-script/appsscript.json'), '{}\n')
  writeFileSync(join(work, '.gitignore'), '.env\n.clasp*.json\n')
  writeFileSync(join(work, '.env'), "PILOT_OWNER_EMAIL='owner@example.test'\n")
  git(work, 'add', '.')
  git(work, 'commit', '-qm', 'initial')
  git(work, 'remote', 'add', 'origin', join(dir, 'origin.git'))
  git(work, 'push', '-q', 'origin', 'main')
  mkdirSync(bin)
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(dir, 'log'), '')
  writeFileSync(join(dir, 'seen'), '')

  const run = (env: Record<string, string> = {}, vars: Record<string, string> = variables) => {
    const { SCOPES_REAUTHORIZED: _scopes, GITHUB_SHA: _sha, ...inherited } = process.env
    const result = Bun.spawnSync(['/bin/bash', join(work, 'pilot/deploy.sh')], {
      cwd: dir,
      stdin: 'ignore',
      env: {
        ...inherited,
        PATH: `${bin}:${process.env.PATH}`,
        STUB_DIR: dir,
        STUB_REAL_GIT: Bun.which('git')!,
        STUB_VARIABLES: JSON.stringify(Object.entries(vars).map(([name, value]) => ({ name, value }))),
        STUB_LOGIN_EMAIL: 'Owner@Example.test',
        ...env
      }
    })
    const read = (file: string) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean)
    return {
      exitCode: result.exitCode,
      output: result.stdout.toString() + result.stderr.toString(),
      // The bun and bunx calls, in order.
      steps: read('log').filter((line) => !line.startsWith('gh ')),
      seen: read('seen')
    }
  }
  return { work, run, sha: git(work, 'rev-parse', 'HEAD') }
}

const clasp = 'bunx @google/clasp@3.4.1'
const project = `${clasp} -P pilot/apps-script/.clasp-pilot.json`
const checks = [
  'bun install --frozen-lockfile',
  'bun run lint',
  'bunx tsc --noEmit -p pilot',
  'bun test',
  'bun pilot/apps-script/build.ts'
]

describe('pilot/deploy.sh deploys', () => {
  test('runs the checks, the scope guard, a login as the owner, the push and the in-place update, in order', () => {
    const { work, run, sha } = checkout()
    mkdirSync(join(work, 'pilot/workflows/setup-2026-11-06'), { recursive: true })
    writeFileSync(join(work, 'pilot/workflows/setup-2026-11-06/x.json'), '{}\n')
    const result = run()
    expect(result.exitCode).toBe(0)
    expect(result.steps).toEqual([
      ...checks,
      'bun pilot/apps-script/deployed.ts scope-guard',
      `${clasp} login`,
      `${clasp} --json show-authorized-user`,
      `${project} push --force`,
      `${project} update-deployment ${variables.INGEST_DEPLOYMENT_ID} -d ${sha}`,
      `bun pilot/apps-script/deployed.ts await-sha ${sha}`
    ])
  })

  // A stale GITHUB_SHA in your shell would stamp a SHA that health never reports.
  test('builds and deploys with the variables and project file the workflow uses', () => {
    const { run, sha } = checkout()
    const result = run({ GITHUB_SHA: 'stale' })
    expect(result.exitCode).toBe(0)
    expect(result.seen).toEqual([
      `build PILOT_SCRIPT_ID=${variables.PILOT_SCRIPT_ID} GITHUB_SHA=${sha}`,
      `scope-guard INGEST_URL=${variables.INGEST_URL}`,
      `project {"scriptId":"${variables.PILOT_SCRIPT_ID}","rootDir":"dist"}`,
      `project {"scriptId":"${variables.PILOT_SCRIPT_ID}","rootDir":"dist"}`
    ])
  })

  test('ends with the deployed SHA and the health JSON, and prints no token or variable value', () => {
    const { run, sha } = checkout()
    const result = run()
    expect(result.exitCode).toBe(0)
    expect(result.output.trimEnd()).toEndWith(
      `✓ Deployed ${sha} to skyclause-pilot\n{\n  "ok": true,\n  "sha": "${sha}"\n}\n` +
        "  With Actions down, this SHA and health JSON are the deploy's evidence in place of a run ID."
    )
    for (const secret of ['stub-secret-token', variables.PILOT_SCRIPT_ID, variables.INGEST_DEPLOYMENT_ID]) {
      expect(result.output).not.toContain(secret)
    }
  })

  test('keeps the token in a temporary HOME that is gone afterwards, with the project file', () => {
    const { work, run } = checkout()
    expect(run().exitCode).toBe(0)
    const homes = new Set(readFileSync(join(work, '../homes'), 'utf8').split('\n').filter(Boolean))
    expect(homes.size).toBe(1)
    const [home] = homes
    expect(home).not.toBe(process.env.HOME)
    expect(existsSync(home!)).toBe(false)
    expect(existsSync(join(work, 'pilot/apps-script/.clasp-pilot.json'))).toBe(false)
  })

  // The workflow's bun and bunx steps, so a change to pilot-deploy.yml fails here until this script follows it.
  test("runs every bun and bunx step of the workflow's checks and apps-script jobs, in their order", () => {
    const { run, sha } = checkout()
    const result = run()
    expect(result.exitCode).toBe(0)
    for (const job of ['checks', 'apps-script']) {
      const expected = workflow.jobs[job]!.steps.map((step) => step.run?.trim() ?? '')
        .filter((command) => /^bunx? /.test(command))
        .map((command) =>
          command.replaceAll('"$GITHUB_SHA"', sha).replaceAll('"$INGEST_DEPLOYMENT_ID"', variables.INGEST_DEPLOYMENT_ID)
        )
      expect(expected.length).toBeGreaterThan(4)
      let next = 0
      for (const step of result.steps) if (step === expected[next]) next++
      expect(expected.slice(next)).toEqual([])
    }
  })
})

describe('pilot/deploy.sh scope changes', () => {
  test('SCOPES_REAUTHORIZED=true skips only the scope guard and says setup() must run next', () => {
    const { run, sha } = checkout()
    const result = run({ SCOPES_REAUTHORIZED: 'true' })
    expect(result.exitCode).toBe(0)
    expect(result.steps).toEqual([
      ...checks,
      `${clasp} login`,
      `${clasp} --json show-authorized-user`,
      `${project} push --force`,
      `${project} update-deployment ${variables.INGEST_DEPLOYMENT_ID} -d ${sha}`,
      `bun pilot/apps-script/deployed.ts await-sha ${sha}`
    ])
    expect(result.output).toContain('run setup() in the Apps Script editor straight after this deploy')
  })

  test('any other SCOPES_REAUTHORIZED value keeps the scope guard', () => {
    const result = checkout().run({ SCOPES_REAUTHORIZED: '1' })
    expect(result.exitCode).toBe(0)
    expect(result.steps).toContain('bun pilot/apps-script/deployed.ts scope-guard')
  })

  test('a failed scope guard stops before the login and names the by-hand way to ship a scope change', () => {
    const result = checkout().run({ STUB_SCOPE_GUARD_EXIT: '1' })
    expect(result.exitCode).not.toBe(0)
    expect(result.steps.at(-1)).toBe('bun pilot/apps-script/deployed.ts scope-guard')
    expect(result.output).toContain('SCOPES_REAUTHORIZED=true bash pilot/deploy.sh')
  })
})

describe('pilot/deploy.sh stops after the checks', () => {
  test('a tracked file changed during the checks stops before the login', () => {
    const { work, run } = checkout()
    const result = run({ STUB_TEST_WRITES: join(work, 'pilot/apps-script/appsscript.json') })
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('local changes')
    expect(result.steps.some((step) => step.startsWith(clasp))).toBe(false)
  })

  test('a login as anyone but the owner stops before the push and leaves no token behind', () => {
    const { work, run } = checkout()
    const result = run({ STUB_LOGIN_EMAIL: 'someone@example.test' })
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('signed in as someone@example.test, not owner@example.test')
    expect(result.steps.at(-1)).toBe(`${clasp} --json show-authorized-user`)
    const [home] = readFileSync(join(work, '../homes'), 'utf8').split('\n')
    expect(existsSync(home!)).toBe(false)
  })

  test('health that never reports the SHA fails the run and still deletes the token and project file', () => {
    const { work, run, sha } = checkout()
    const result = run({ STUB_AWAIT_EXIT: '1' })
    expect(result.exitCode).not.toBe(0)
    expect(result.steps.at(-1)).toBe(`bun pilot/apps-script/deployed.ts await-sha ${sha}`)
    expect(result.output).not.toContain('✓ Deployed')
    const [home] = readFileSync(join(work, '../homes'), 'utf8').split('\n')
    expect(existsSync(home!)).toBe(false)
    expect(existsSync(join(work, 'pilot/apps-script/.clasp-pilot.json'))).toBe(false)
  })

  test('a re-run after a failed run deploys', () => {
    const { run } = checkout()
    expect(run({ STUB_AWAIT_EXIT: '1' }).exitCode).not.toBe(0)
    const result = run()
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('✓ Deployed')
  })
})

describe('pilot/deploy.sh refusals', () => {
  for (const inspection of ['status', 'ls-files']) {
    for (const afterChecks of [false, true]) {
      test(`refuses a failed ${inspection} inspection ${afterChecks ? 'after' : 'before'} the checks`, () => {
        const result = checkout().run({
          STUB_GIT_FAIL: inspection,
          STUB_GIT_FAIL_AFTER_CHECKS: String(afterChecks)
        })
        expect(result.exitCode).toBe(9)
        expect(result.output).toContain(`fatal: cannot inspect ${inspection}`)
        expect(result.output).not.toContain('✓ Deployed')
        expect(result.steps).toEqual(afterChecks ? checks : [])
      })
    }
  }

  for (const change of ['modification', 'staged addition', 'staged deletion']) {
    test(`refuses a tracked workflow ${change}`, () => {
      const { work, run } = checkout()
      const setup = join(work, 'pilot/workflows/ge-setup.sh')
      if (change === 'modification') writeFileSync(setup, '# changed workflow setup\n')
      if (change === 'staged addition') {
        writeFileSync(join(work, 'pilot/workflows/new.md'), '# new workflow\n')
        git(work, 'add', 'pilot/workflows/new.md')
      }
      if (change === 'staged deletion') git(work, 'rm', 'pilot/workflows/ge-setup.sh')
      const result = run()
      expect(result.exitCode).not.toBe(0)
      expect(result.output).toContain('local changes')
      expect(result.steps).toEqual([])
    })
  }

  for (const path of ['pilot/workflows-extra.json', 'pilot/outside\nworkflow.json', 'pilot/\tworkflow.json']) {
    test(`refuses an untracked filename ${JSON.stringify(path)} outside the workflow directory`, () => {
      const { work, run } = checkout()
      writeFileSync(join(work, path), '{}\n')
      const result = run()
      expect(result.exitCode).not.toBe(0)
      expect(result.output).toContain('local changes')
      expect(result.steps).toEqual([])
    })
  }

  test('refuses a changed tracked file before running anything', () => {
    const { work, run } = checkout()
    writeFileSync(join(work, 'pilot/apps-script/appsscript.json'), '{"changed":true}\n')
    const result = run()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('local changes')
    expect(result.steps).toEqual([])
  })

  test('refuses an untracked file outside pilot/workflows', () => {
    const { work, run } = checkout()
    writeFileSync(join(work, 'pilot/apps-script/extra.ts'), 'export {}\n')
    const result = run()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('local changes')
    expect(result.steps).toEqual([])
  })

  test('refuses a commit that is not on origin/main', () => {
    const { work, run } = checkout()
    writeFileSync(join(work, 'pilot/apps-script/appsscript.json'), '{"local":true}\n')
    git(work, 'commit', '-qam', 'local only')
    const result = run()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('origin/main')
    expect(result.steps).toEqual([])
  })

  // Deploying a commit behind the tip would roll the pilot back.
  test('refuses a commit behind the tip of origin/main', () => {
    const { work, run } = checkout()
    writeFileSync(join(work, 'pilot/apps-script/appsscript.json'), '{"next":true}\n')
    git(work, 'commit', '-qam', 'next')
    git(work, 'push', '-q', 'origin', 'main')
    git(work, 'reset', '-q', '--hard', 'HEAD~1')
    const result = run()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('origin/main')
    expect(result.steps).toEqual([])
  })

  // GitHub compares strings case-insensitively, so the workflow's `vars.DEPLOY_FREEZE != 'true'` freezes on these too.
  test.each(['true', 'TRUE', 'True'])('refuses while DEPLOY_FREEZE is %s', (freeze) => {
    const result = checkout().run({}, { ...variables, DEPLOY_FREEZE: freeze })
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('DEPLOY_FREEZE is true')
    expect(result.steps).toEqual([])
  })

  test('stops when GitHub cannot be read, rather than reading DEPLOY_FREEZE as unset', () => {
    const result = checkout().run({ STUB_GH_FAIL: '1' })
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('HTTP 502')
    expect(result.output).not.toContain('pilot/wizard.sh')
    expect(result.steps).toEqual([])
  })

  test('names the variables the wizard has not set, never their values', () => {
    const { INGEST_DEPLOYMENT_ID: _id, INGEST_URL: _url, ...set } = variables
    const result = checkout().run({}, set)
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('INGEST_DEPLOYMENT_ID INGEST_URL')
    expect(result.output).toContain('pilot/wizard.sh')
    expect(result.output).not.toContain(variables.PILOT_SCRIPT_ID)
    expect(result.steps).toEqual([])
  })

  test("refuses when .env doesn't name the pilot owner", () => {
    const { work, run } = checkout()
    writeFileSync(join(work, '.env'), "TEAM_ALERT_EMAILS='team@example.test'\n")
    const result = run()
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('.env has no PILOT_OWNER_EMAIL')
    expect(result.steps).toEqual([])
  })

  test('deploys when DEPLOY_FREEZE is unset', () => {
    const { DEPLOY_FREEZE: _freeze, ...unfrozen } = variables
    const result = checkout().run({}, unfrozen)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('✓ Deployed')
  })
})

test('pilot/deploy.sh parses with bash -n', () => {
  expect(Bun.spawnSync(['/bin/bash', '-n', join(import.meta.dir, 'deploy.sh')]).exitCode).toBe(0)
})
