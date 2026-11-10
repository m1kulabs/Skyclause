import { createApiFetch } from '../../lib/api-fetch'
import { shellOperations } from './operations'

const apiFetch = createApiFetch(shellOperations, { baseUrl: '' })

export async function saveSidebarPreference(collapsed: boolean): Promise<void> {
  const preferences = await apiFetch('updateMyPreferences', { body: { sidebar_collapsed: collapsed } })
  if (preferences.sidebar_collapsed !== collapsed) throw new Error('Sidebar preference was not confirmed')
}
