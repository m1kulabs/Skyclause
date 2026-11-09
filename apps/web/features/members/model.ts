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
