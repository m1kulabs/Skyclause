import type { ShadowEvaluator } from '@skyclause/contracts'
import type { ProposedBundle } from './schema'

/** The clause engine's `Verdicts` (§1), reached through the contracts port since the §1 cell bars importing clauses. */
export type Verdicts = ReturnType<ShadowEvaluator['evaluate']>['verdicts']
export interface Comparison {
  windowId: string
  agrees: boolean
  /** The shadow verdict shows a cited input (fired or No call) in a state other than `fresh`. */
  staleInputs: boolean
  /** Set when the bundle has no call for this window or night although its shadow verdict fired. */
  missing?: true
}

/**
 * CAL-4: each call against the shadow verdict; disagreements first, then agreements, each in window order. A window or
 * night whose shadow verdict fired (a mode above Normal, or watch) but that has no call or night item is a disagreement marked
 * `missing`: a dropped call must not read as agreement.
 */
export function compare(p: ProposedBundle, verdicts: Verdicts): Comparison[] {
  const scoped = [...verdicts.windows, ...verdicts.nights]
  const order = new Map(scoped.map((v, i) => [v.scope.id, i]))
  const states = new Map<string, string>()
  const note = (v: Verdicts['site'][number]) => {
    for (const clause of v.clauses) {
      for (const input of [...clause.inputs, ...clause.blockedBy])
        states.set(`${v.scope.id}:${input.name}`, input.state)
    }
    for (const input of v.noCall?.inputs ?? []) states.set(`${v.scope.id}:${input.name}`, input.state)
  }
  scoped.forEach(note)
  verdicts.site.forEach(note)
  const site = verdicts.site.map((v) => v.scope.id)

  const rows: Array<{ row: Comparison; rank: number }> = p.calls.map((call, index) => {
    const shadow = scoped.find((v) => v.scope.id === call.window_id)
    const agrees =
      shadow !== undefined &&
      shadow.mode === call.mode &&
      shadow.watch === call.watch &&
      (shadow.noCall !== null) === (call.no_call !== null)
    const cited = [...call.fired.flatMap((f) => f.inputs), ...(call.no_call ?? [])]
    const staleInputs = cited.some((name) => {
      const state = [call.window_id, ...site].map((id) => states.get(`${id}:${name}`)).find((s) => s !== undefined)
      return state !== undefined && state !== 'fresh'
    })
    return {
      row: { windowId: call.window_id, agrees, staleInputs },
      rank: order.get(call.window_id) ?? scoped.length + index
    }
  })
  // A Crowd night is also answered by its `surge_night_entry` item.
  const called = new Set([...p.calls.map((call) => call.window_id), ...p.items.map((item) => item.night_id)])
  scoped.forEach((v, rank) => {
    const fired = v.watch || (v.mode !== null && v.mode !== 'normal')
    if (fired && v.scope.id !== null && !called.has(v.scope.id)) {
      rows.push({ row: { windowId: v.scope.id, agrees: false, staleInputs: false, missing: true }, rank })
    }
  })
  rows.sort((a, b) => Number(a.row.agrees) - Number(b.row.agrees) || a.rank - b.rank)
  return rows.map(({ row }) => row)
}
