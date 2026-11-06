import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { plantRepo } from './test-helpers'

const script = fileURLToPath(new URL('./audit-issue.ts', import.meta.url))

const TITLE = 'fix: patch production dependency advisories'

// `bun audit --json` output, captured from bun 1.4.4 on 6 November 2026 (before #253 fixed this advisory).
const finding = {
  minimatch: [
    {
      id: 1244623,
      url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
      title: 'minimatch has potential denial of service via globparts amplification',
      severity: 'moderate',
      vulnerable_versions: '>=7.0.0 <11.0.1',
      cwe: ['CWE-405'],
      cvss: { score: 0, vectorString: null }
    }
  ]
}

// A stand-in `gh` that records each call (arguments, then stdin), answers `issue list` with ISSUES and fails the
// subcommand named in GH_FAIL.
const fakeGh = `#!/usr/bin/env bash
{ printf '%s\\n' "$*"; if [ "$1 $2" != 'issue list' ]; then cat; fi; printf '\\n--\\n'; } >> "$GH_LOG"
if [ "$1 $2" = "$GH_FAIL" ]; then exit 1; fi
if [ "$1 $2" = 'issue list' ]; then printf '%s' "$ISSUES"; fi
`

function run(audit: string, issues: object[] = [], fail = '') {
  const dir = plantRepo({ 'audit.json': audit, 'bin/gh': fakeGh })
  chmodSync(join(dir, 'bin/gh'), 0o755)
  const log = join(dir, 'gh.log')
  const result = spawnSync('bun', [script, join(dir, 'audit.json')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      GH_LOG: log,
      ISSUES: JSON.stringify(issues),
      GH_FAIL: fail,
      RUN_URL: 'https://github.com/m1kulabs/Skyclause/actions/runs/1'
    }
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n--\n').filter(Boolean) : []
  return { ...result, calls }
}

test('passes and touches no issue when bun audit finds nothing', () => {
  const result = run('{}')
  expect(result.status).toBe(0)
  expect(result.calls).toEqual([])
})

test.each([
  ['nothing', ''],
  ['an error object', '{"error":"ConnectionRefused"}']
])('fails without touching an issue when bun audit printed %s', (_, output) => {
  const result = run(output)
  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(/bun audit didn't print its advisory JSON/)
  expect(result.calls).toEqual([])
})

test('opens one devops issue for kymil4 listing each advisory, and fails', () => {
  const result = run(JSON.stringify(finding), [{ number: 7, title: `${TITLE} again`, body: '' }])
  expect(result.status).toBe(1)
  expect(result.calls).toHaveLength(2)
  const create = result.calls[1]
  expect(create).toMatch(/^issue create --title fix: patch production dependency advisories --label devops/)
  expect(create).toMatch(/--assignee kymil4/)
  expect(create).toContain(
    '- `minimatch`, moderate, `>=7.0.0 <11.0.1`: ' +
      '[minimatch has potential denial of service via globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)'
  )
})

test('updates the open issue and comments with the run when the advisories change', () => {
  const result = run(JSON.stringify(finding), [{ number: 12, title: TITLE, body: 'an older list' }])
  expect(result.status).toBe(1)
  expect(result.calls.map((call) => call.split('\n')[0])).toEqual([
    expect.stringMatching(/^issue list /),
    'issue edit 12 --body-file -',
    'issue comment 12 --body-file -'
  ])
  expect(result.calls[1]).toContain('- `minimatch`, moderate')
  expect(result.calls[2]).toContain('https://github.com/m1kulabs/Skyclause/actions/runs/1')
})

test('leaves the open issue alone when the advisories are unchanged, and still fails', () => {
  const first = run(JSON.stringify(finding))
  const body = first.calls[1]!.split('\n').slice(1).join('\n')
  // GitHub can hand a body back with CRLF line endings.
  const result = run(JSON.stringify(finding), [{ number: 12, title: TITLE, body: body.replace(/\n/g, '\r\n') }])
  expect(result.status).toBe(1)
  expect(result.calls).toHaveLength(1)
})

test('exits 2 rather than 1 when gh cannot write the issue', () => {
  const result = run(JSON.stringify(finding), [], 'issue create')
  expect(result.status).toBe(2)
  expect(result.stderr).toMatch(/gh issue create .* failed/)
})
