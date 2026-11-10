import {
  deliverSourceTransition,
  listSourceTransitionDeliveries,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'

/** Safe to resume after any tenant commit; completed recipients and earlier transitions stay authoritative. */
export async function deliverSourceTransitions(): Promise<void> {
  const pending = await withSystem('evaluator-source-delivery', listSourceTransitionDeliveries)
  for (const target of pending)
    await withTenant({ orgId: target.orgId, principal: systemPrincipal('evaluator-source-delivery') }, (tx) =>
      deliverSourceTransition(tx, target)
    )
}
