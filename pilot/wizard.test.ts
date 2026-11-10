import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dir, '..')
const wizard = readFileSync(join(import.meta.dir, 'wizard.sh'), 'utf8')
const workflows = readdirSync(join(repo, '.github', 'workflows'))
  .filter((file) => file.startsWith('pilot-'))
  .map((file) => readFileSync(join(repo, '.github', 'workflows', file), 'utf8'))

// The stages below the library's STAGES marker, without comments.
const stages = wizard
  .slice(wizard.indexOf('# STAGES:'))
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

const written = (kind: 'secret' | 'var') =>
  [
    ...new Set([...stages.matchAll(new RegExp(`\\bset_${kind} ([A-Z][A-Z0-9_]*)\\b`, 'g'))].map((match) => match[1]))
  ].sort()
const referenced = (kind: 'secrets' | 'vars') =>
  [
    ...new Set(
      workflows.flatMap((text) =>
        [...text.matchAll(new RegExp(`\\b${kind}\\.([A-Z][A-Z0-9_]*)\\b`, 'g'))].map((m) => m[1])
      )
    )
  ].sort()

describe('pilot/wizard.sh', () => {
  // DEPLOY_FREEZE is the one exception: #78 and P1's workflows share it, so the wizard only reads it.
  test('writes exactly the secrets and variables the pilot workflows read', () => {
    expect(written('secret')).toEqual(referenced('secrets'))
    expect(written('var')).toEqual(referenced('vars').filter((name) => name !== 'DEPLOY_FREEZE'))
    expect(written('secret')).toEqual(['CLASPRC_JSON'])
  })

  test('asks for any Workspace owner and still refuses consumer Gmail', () => {
    const owner = stages.slice(
      stages.indexOf('stage "Pick the pilot owner"'),
      stages.indexOf('stage "Apps Script API and the admin checks"')
    )
    expect(owner).toContain('One Google Workspace account owns')
    expect(owner).toContain('Consumer Gmail has no Workspace admin console for stage 2.')
    expect(owner).toMatch(/Top 5 final.*pilot's data reachable from the GE-licensed domain.*#576/)
    expect(stages.split('\n').filter((line) => line.includes('GE-licensed'))).toHaveLength(1)
    expect(owner).toContain(
      `*@gmail.com | *@googlemail.com) warn "that's a consumer account; use the Workspace one" ;;`
    )
    expect(owner).toContain('?*@?*.?*) break ;;')
  })

  test('parses with bash -n', () => {
    expect(Bun.spawnSync(['bash', '-n', join(import.meta.dir, 'wizard.sh')]).exitCode).toBe(0)
  })
})
