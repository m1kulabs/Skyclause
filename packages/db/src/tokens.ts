import { createHash } from 'node:crypto'

/** How `guest_token.token_hash` and `share_link.token_hash` store a token: SHA-256, hex (#94). */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
