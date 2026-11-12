import type { SettingsScope } from './access'

export const settingsSections = {
  account: ['profile', 'security', 'appearance', 'notifications', 'ai-keys', 'api-keys', 'data'],
  organisation: [
    'general',
    'members',
    'rota',
    'billing',
    'audit',
    'ai-keys',
    'api-keys',
    'webhooks',
    'integrations',
    'data'
  ],
  project: ['general', 'packs', 'channels', 'rota', 'public', 'share']
} as const satisfies Record<SettingsScope, readonly string[]>

export function settingsHref(scope: SettingsScope, section: string, org?: string, project?: string) {
  if (scope === 'account') return `/account/${section}`
  const organisation = encodeURIComponent(org ?? '')
  if (scope === 'organisation') return `/${organisation}/settings/${section}`
  const base = `/${organisation}/${encodeURIComponent(project ?? '')}`
  return section === 'general' ? `${base}/settings` : `${base}/settings/${section}`
}
