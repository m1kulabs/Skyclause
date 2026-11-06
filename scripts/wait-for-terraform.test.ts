import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./wait-for-terraform.sh', import.meta.url))

// A stand-in for `gh api <path> --jq <filter>`: answers the runs list and a run's status from scripted queues (one
// JSON document per line, the last one repeating), applies --jq like gh does, and logs every path it was asked for.
const fakeGh = `#!/usr/bin/env bash
set -euo pipefail
path=$2 filter=$4
case "$path" in
  */workflows/terraform.yml/runs*) queue=list ;;
  */actions/runs/*) queue=run ;;
  *) echo "unexpected gh api $path" >&2; exit 9 ;;
esac
echo "$path" >> "$FAKE_GH/calls"
count=$(( $(cat "$FAKE_GH/$queue.count" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$FAKE_GH/$queue.count"
total=$(wc -l < "$FAKE_GH/$queue")
sed -n "$(( count < total ? count : total ))p" "$FAKE_GH/$queue" | jq -r "$filter"
`

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

// The test repository's own identity, so a machine's git config (name, signing) doesn't matter.
const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false']
const commit = (cwd: string, ...args: string[]) => git(cwd, ...identity, 'commit', '-q', ...args)

// A repository whose history is: base, then a push touching apps/ only, then a push touching infra/ and apps/.
function plantHistory() {
  const repo = plantRepo({ 'apps/worker/src/main.ts': 'base\n', 'infra/main.tf': 'base\n' })
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', '.')
  commit(repo, '-m', 'base')
  const base = git(repo, 'rev-parse', 'HEAD')
  writeFileSync(join(repo, 'apps/worker/src/main.ts'), 'apps only\n')
  commit(repo, '-am', 'apps only')
  const appsOnly = git(repo, 'rev-parse', 'HEAD')
  writeFileSync(join(repo, 'apps/worker/src/main.ts'), 'with a job\n')
  writeFileSync(join(repo, 'infra/main.tf'), 'module "job" {}\n')
  commit(repo, '-am', 'infra and apps')
  const withInfra = git(repo, 'rev-parse', 'HEAD')
  return { repo, base, appsOnly, withInfra }
}

const runsList = (...runs: object[]) => JSON.stringify({ total_count: runs.length, workflow_runs: runs })
const run = (status: string, conclusion: string | null = null) =>
  JSON.stringify({ id: 42, status, conclusion, html_url: 'https://github.com/o/r/actions/runs/42' })

function wait(push: { repo: string; before: string; sha: string }, gh: { list?: string[]; run?: string[] } = {}) {
  const fake = plantRepo({
    'bin/gh': fakeGh,
    list: (gh.list ?? [runsList()]).join('\n') + '\n',
    run: (gh.run ?? [run('queued')]).join('\n') + '\n'
  })
  chmodSync(join(fake, 'bin/gh'), 0o755)
  const result = spawnSync(script, [push.before, push.sha], {
    cwd: push.repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(fake, 'bin')}:${process.env.PATH}`,
      FAKE_GH: fake,
      GITHUB_REPOSITORY: 'o/r',
      POLL_SECONDS: '0'
    }
  })
  let calls: string[] = []
  try {
    calls = readFileSync(join(fake, 'calls'), 'utf8').trim().split('\n')
  } catch {
    // No calls file: gh was never asked anything.
  }
  return { ...result, calls }
}

test('a push without an infra/ change returns at once, without asking GitHub', () => {
  const { repo, base, appsOnly } = plantHistory()
  const result = wait({ repo, before: base, sha: appsOnly })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.stdout).toMatch(/no infra\/ change/i)
  expect(result.calls).toEqual([])
})

test('a push changing infra/ waits for its terraform run to appear and succeed', () => {
  const { repo, appsOnly, withInfra } = plantHistory()
  const result = wait(
    { repo, before: appsOnly, sha: withInfra },
    {
      list: [runsList(), runsList(JSON.parse(run('queued')))],
      run: [run('queued'), run('in_progress'), run('completed', 'success')]
    }
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('https://github.com/o/r/actions/runs/42 succeeded')
  expect(result.calls).toEqual([
    `repos/o/r/actions/workflows/terraform.yml/runs?head_sha=${withInfra}&event=push`,
    `repos/o/r/actions/workflows/terraform.yml/runs?head_sha=${withInfra}&event=push`,
    'repos/o/r/actions/runs/42',
    'repos/o/r/actions/runs/42',
    'repos/o/r/actions/runs/42'
  ])
})

test('a failed or cancelled terraform run fails the wait, naming the run', () => {
  const { repo, appsOnly, withInfra } = plantHistory()
  for (const conclusion of ['failure', 'cancelled']) {
    const result = wait(
      { repo, before: appsOnly, sha: withInfra },
      { list: [runsList(JSON.parse(run('in_progress')))], run: [run('completed', conclusion)] }
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(`::error::terraform run https://github.com/o/r/actions/runs/42 ended ${conclusion}`)
  }
})

test('a push changing infra/ with no terraform run to wait for fails rather than deploying past it', () => {
  const { repo, appsOnly, withInfra } = plantHistory()
  const result = wait({ repo, before: appsOnly, sha: withInfra }, { list: [runsList()] })
  expect(result.status).toBe(1)
  expect(result.stdout).toContain(`::error::This push changed infra/, but no terraform run for ${withInfra} appeared`)
  expect(result.calls).toHaveLength(20)
})

test('a push whose base commit is missing (a force-push) waits as if it changed infra/', () => {
  const { repo, withInfra } = plantHistory()
  const result = wait(
    { repo, before: 'f'.repeat(40), sha: withInfra },
    { list: [runsList(JSON.parse(run('in_progress')))], run: [run('completed', 'success')] }
  )
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(`::warning::Can't diff ${'f'.repeat(40)}..${withInfra}`)
  expect(result.stdout).toContain('https://github.com/o/r/actions/runs/42 succeeded')
})
