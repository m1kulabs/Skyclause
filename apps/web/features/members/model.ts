import type { Invitation, Membership, OwnershipTransfer, Role } from '@skyclause/contracts'

export type Member = Membership & {
  name: string
  email: string
  last_active_at: string | null
  sign_in_methods: string[]
}

export type PendingInvitation = Invitation & {
  expires_at: string
  sent_at?: string
}

export type PendingTransfer = OwnershipTransfer
export type ManagedRole = Exclude<Role, 'guest' | 'owner'>

const ROLE_ORDER: Array<ManagedRole | 'owner'> = ['viewer', 'editor', 'approver', 'admin', 'owner']

export function roleOptions(_viewerRole: 'owner' | 'admin'): ManagedRole[] {
  return ROLE_ORDER.filter((role): role is ManagedRole => role !== 'owner')
}

export function roleIsLowering(current: ManagedRole | 'owner', next: ManagedRole): boolean {
  return ROLE_ORDER.indexOf(next) < ROLE_ORDER.indexOf(current)
}

export function problemCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('body' in error)) return null
  const body = (error as { body?: Record<string, unknown> }).body
  if (!body) return null
  const code = typeof body.code === 'string' ? body.code : typeof body.type === 'string' ? body.type : null
  return code?.split(/[/:#]/).filter(Boolean).at(-1)?.toLowerCase() ?? null
}

export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return address
  const local = address.slice(0, at)
  return `${local.slice(0, 1)}***${address.slice(at)}`
}

export function errorMessageKey(error: unknown, fallback: string): string {
  switch (problemCode(error)) {
    case 'last-owner':
      return 'members.last_owner'
    case 'role-not-grantable':
      return 'members.role_not_grantable'
    case 'invite-withdrawn':
      return 'members.invite_withdrawn'
    case 'link-expired':
      return 'members.invite_expired'
    default:
      return fallback
  }
}

/**
 * How long ago a member was last active, in words, as a key and a count the catalogue can phrase: under a minute, then
 * minutes up to 90, hours up to 36, days up to 30, and after that a date (the caller prints it).
 */
export function activityAge(
  instant: string,
  now: number = Date.now()
): { unit: 'now' | 'minutes' | 'hours' | 'days' | 'date'; value: number } {
  const minutes = Math.max(0, Math.floor((now - new Date(instant).getTime()) / 60_000))
  if (minutes < 1) return { unit: 'now', value: 0 }
  if (minutes <= 90) return { unit: 'minutes', value: minutes }
  const hours = Math.round(minutes / 60)
  if (hours <= 36) return { unit: 'hours', value: hours }
  const days = Math.round(hours / 24)
  return days <= 30 ? { unit: 'days', value: days } : { unit: 'date', value: days }
}
