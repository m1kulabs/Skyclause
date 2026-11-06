// CAL-4: the compare step. Each drafted call is checked against the clause engine's shadow verdict for its window,
// and disagreements go first with both verdicts (#47 spec decision 5, `ledger.agrees`; #63 CAL-4). The crossing
// workflow's compare node is a GE agent node, so its instructions restate these rules.

// The fields of a drafted call (#47 "Workflows and the agent", TRD `Call`) the comparison reads.
export interface DraftCall {
  window_id: string
  mode: string | null
  no_call: readonly string[] | null
}

// The `shadow` tab's `scope` and `verdict` (`{mode}` or `no_call`).
export interface ShadowVerdict {
  scope: string
  verdict: string
}

export type Agrees = 'Y' | `N:${string}`

export interface Compared<C extends DraftCall> {
  call: C
  agent: string
  shadow: string
  agrees: Agrees
}

export function compareWithShadow<C extends DraftCall>(
  calls: readonly C[],
  shadow: readonly ShadowVerdict[]
): Compared<C>[] {
  const compared = calls.map((call): Compared<C> => {
    const agent = call.no_call?.length ? 'no_call' : call.mode
    if (!agent) throw new Error(`no verdict in the call for ${call.window_id}`)
    const verdict = shadow.find((row) => row.scope === call.window_id)?.verdict
    if (!verdict) throw new Error(`no shadow row for ${call.window_id}`)
    return { call, agent, shadow: verdict, agrees: agent === verdict ? 'Y' : `N:${verdict}` }
  })
  // Disagreements first; each group keeps the draft order.
  return [...compared.filter((entry) => entry.agrees !== 'Y'), ...compared.filter((entry) => entry.agrees === 'Y')]
}
