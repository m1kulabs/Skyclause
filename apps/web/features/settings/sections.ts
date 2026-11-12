import type { SettingsScope } from './access'

/** The sections each settings navigation lists: every one works with operations that are built. */
export const settingsSections = {
  account: ['profile', 'security', 'appearance', 'notifications', 'data'],
  organisation: ['general', 'members', 'rota', 'billing', 'audit', 'integrations', 'data'],
  project: ['general', 'packs', 'channels', 'rota']
} as const satisfies Record<SettingsScope, readonly string[]>

/**
 * Sections whose operations have no handler yet, so they can only say they are not available: reached by URL they
 * say so, but no navigation lists them. AI and API keys wait on a-keys-ui, webhooks on e-webhooks, the public page on
 * d-public-project-page and share links on b-share-links (`listShareLinks`, `createShareLink`, `revokeShareLink`).
 * Move each back into `settingsSections`, where it stood, when its handler lands.
 */
export const unlistedSettingsSections = {
  account: ['ai-keys', 'api-keys'],
  organisation: ['ai-keys', 'api-keys', 'webhooks'],
  project: ['public', 'share']
} as const satisfies Record<SettingsScope, readonly string[]>

export function settingsHref(scope: SettingsScope, section: string, org?: string, project?: string) {
  if (scope === 'account') return `/account/${section}`
  const organisation = encodeURIComponent(org ?? '')
  if (scope === 'organisation') return `/${organisation}/settings/${section}`
  const base = `/${organisation}/${encodeURIComponent(project ?? '')}`
  return section === 'general' ? `${base}/settings` : `${base}/settings/${section}`
}
