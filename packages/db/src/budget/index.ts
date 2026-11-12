import { NotBuiltError, type BudgetGate, type Principal } from '@skyclause/contracts'
import { eq } from 'drizzle-orm'
import type { Tx } from '../client'
import { organization } from '../schema/auth'

// #79 §1 BudgetGate. #181 (d-guest-rules) caps guests and guest tokens per device and IP, reviewer links per link,
// and every Commons run by the Commons model budget. Those counters aren't built yet, so those callers still get
// not-built. Any other caller in any other organisation has no daily cap to spend, so its run, evidence request or
// window is allowed.

/** Callers #181 charges to a device, an IP or a link. */
function capped(p: Principal): boolean {
  if (p.kind === 'guest_token' || p.kind === 'share_link') return true
  if (p.kind === 'session' && p.isGuest) return true
  return 'shareLinkId' in p && Boolean(p.shareLinkId)
}

export const budgetGate: BudgetGate = {
  async consume(handle, principal) {
    const tx = handle as Tx
    if (capped(principal)) throw new NotBuiltError('d-guest-rules')
    if (!tx.orgId) throw new Error('BudgetGate needs a tenant transaction')
    const [org] = await tx.select({ slug: organization.slug }).from(organization).where(eq(organization.id, tx.orgId))
    if (!org) throw new Error('BudgetGate could not read the organisation')
    // Every Commons run also spends the Commons model budget (D35), which isn't built: refuse loudly, never allow.
    if (org.slug === 'commons') throw new NotBuiltError('d-guest-rules')
    return { ok: true }
  }
}
