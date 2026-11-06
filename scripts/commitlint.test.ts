import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

// The PR-title check (pilot-ci's pr-title) pipes the title through commitlint the same way.
function commitlint(header: string) {
  return spawnSync('bunx', ['commitlint'], { cwd: root, input: `${header}\n`, encoding: 'utf8' }).status
}

// Shapes from dependabot-core's message_builder.rb with this repo's prefixes (.github/dependabot.yml, #228).
test.each([
  'ci: bump node from `5ec23b7` to `9f1c2ab`',
  'ci: bump the actions group across 3 directories with 4 updates',
  'ci: bump actions/upload-artifact from 7.0.2 to 7.1.0 in the actions group across 1 directory',
  'ci: [security] bump google-github-actions/auth from 3.0.0 to 3.0.1',
  'build: bump the npm group with 1 update',
  'build: bump @opentelemetry/exporter-trace-otlp-proto from 0.223.0 to 0.224.0 in the npm group',
  'build(deps-dev): bump @next/eslint-plugin-next from 16.4.5 to 17.0.0'
])('passes Dependabot title %s', (header) => {
  expect(commitlint(header)).toBe(0)
})

test.each([
  'ci: add a scheduled job that audits the production dependencies',
  'ci: bump the cache key in every workflow so the stale caches go away',
  'build: bump node to 24 everywhere because Node 22 maintenance is ending',
  'Bump node from `5ec23b7` to `9f1c2ab`'
])('still fails human header %s', (header) => {
  expect(commitlint(header)).not.toBe(0)
})
