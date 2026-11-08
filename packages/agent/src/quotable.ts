import { age, mytDate, mytTime, quantity } from './format'
import type { AgentInput } from './schema'

// Ticket decision for CAL-3 (no arithmetic): every number a notice may carry, formatted here, never by the model.
export function quotable(input: AgentInput): string[] {
  const out: string[] = []
  const add = (...items: Array<string | null | undefined>) => {
    for (const item of items) if (item) out.push(item)
  }
  const { snapshot } = input

  for (const value of Object.values(snapshot.site)) {
    if (typeof value.value === 'number') add(quantity(value.value, value.unit))
    if (Array.isArray(value.value)) add(...value.value.map((n) => quantity(n, value.unit)))
    if (value.ageS !== null) add(age(value.ageS))
    if (value.observedAt) add(mytTime(value.observedAt))
  }
  add(mytTime(snapshot.tEval), mytDate(snapshot.tEval))
  for (const window of input.windows) {
    add(mytDate(window.starts_at), mytTime(window.starts_at), mytDate(window.ends_at), mytTime(window.ends_at))
  }
  // Crowd nights carry their forecast figures and periods; without them no surge-night notice could quote its forecast.
  for (const night of snapshot.nights) {
    add(mytDate(`${night.date}T12:00:00+08:00`))
    for (const n of [night.baseline, night.uplift, night.forecast, night.band?.low, night.band?.high]) {
      if (typeof n === 'number') add(quantity(n, ''))
    }
    for (const at of [night.doors, night.show, night.arrivalStart, night.arrivalEnd, night.exitStart, night.exitEnd]) {
      if (at) add(mytTime(at))
    }
  }
  // Digits inside indicator names: `site.rain_60m_mm` lets a notice say "60 min".
  const names = [...Object.keys(snapshot.site), ...snapshot.inputs.map((i) => i.name), ...Object.keys(snapshot.series)]
  for (const name of names) add(...(name.match(/\d+/g) ?? []))
  add(...input.quotable)
  return [...new Set(out)]
}
