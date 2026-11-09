import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const panels = (scope: string, sections: string[]) =>
  sections.map((section) => `apps/web/features/settings/${scope}/${section}/panel.tsx`)

export const expectedOwners: Record<string, string[]> = {
  'a-account-settings': panels('account', ['profile', 'security', 'appearance']),
  'a-keys-ui': [...panels('account', ['ai-keys', 'api-keys']), ...panels('organisation', ['ai-keys', 'api-keys'])],
  'a-settings-pages': [...panels('account', ['data']), ...panels('organisation', ['billing', 'audit', 'data'])],
  'a-org-projects': panels('organisation', ['general']),
  'e-webhooks-ui': panels('organisation', ['webhooks']),
  'e-mcp-auth': panels('organisation', ['integrations']),
  'b-project-ui': panels('project', ['general', 'rota', 'share']),
  'b-create-project-ui': panels('project', ['packs']),
  'c-channels-ui': panels('project', ['channels']),
  'd-public-project-page': panels('project', ['public']),
  'a-step-up': ['apps/web/features/reauth/use-reauth.ts', 'apps/web/features/reauth/reauth-dialog.tsx'],
  'd-org-live': ['apps/web/features/org-live/index.tsx']
}

test('check:unbuilt reports every settings panel and shared part under its spec owner', () => {
  const root = resolve(import.meta.dirname, '../../../..')
  const result = spawnSync('bun', ['scripts/check-unbuilt.ts'], { cwd: root, encoding: 'utf8' })
  expect(result.status).toBe(1)
  const byOwner: Record<string, string[]> = {}
  let owner = ''
  for (const line of result.stdout.split('\n')) {
    if (/^[a-z][a-z-]+$/.test(line)) owner = line
    if (line.startsWith('  ')) (byOwner[owner] ??= []).push(line.trim().replace(/:\d+$/, ''))
  }
  for (const [key, files] of Object.entries(expectedOwners)) {
    expect([...new Set(byOwner[key])].filter((file) => files.includes(file)).sort(), key).toEqual([...files].sort())
  }
  const panelFiles = Object.values(byOwner)
    .flat()
    .filter((file) => file.includes('/settings/') && file.endsWith('/panel.tsx'))
  expect(panelFiles).toHaveLength(20)
})
