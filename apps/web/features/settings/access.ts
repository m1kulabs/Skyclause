import type { Principal } from '@skyclause/contracts'

export type SettingsScope = 'account' | 'organisation' | 'project'
export interface SettingsTarget {
  scope: SettingsScope
  section: string
  orgId?: string
}

/** Page visibility only; panel owners enforce action permissions with can(). */
export function maySeeSettings(principal: Principal | null, target: SettingsTarget): boolean {
  if (principal?.kind !== 'session') return false
  if (target.scope === 'account') return !principal.isGuest || target.section === 'appearance'
  if (principal.isGuest || !target.orgId || principal.orgId !== target.orgId) return false
  return (
    principal.role === 'owner' ||
    principal.role === 'admin' ||
    (target.scope === 'organisation' && target.section === 'rota' && principal.role === 'approver')
  )
}
