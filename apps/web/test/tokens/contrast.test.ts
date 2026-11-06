import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const css = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8')

function variables(selector: string): Record<string, string> {
  const block = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) =>
    match[1]!.split(',').some((item) => item.trim() === selector)
  )
  if (!block) throw new Error(`Missing CSS selector: ${selector}`)
  return Object.fromEntries([...block[2]!.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]))
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = parseInt(value, 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

// Every foreground/background pair in DESIGN's “Contrast ratios”, in table order.
const pairs: Array<[string, string, string, number]> = [
  ['.dark', 'landing-foreground', 'landing-background', 17.22],
  ['.dark', 'landing-foreground', 'landing-surface', 15.88],
  ['.dark', 'landing-muted-foreground', 'landing-background', 5.89],
  ['.dark', 'landing-muted-foreground', 'landing-surface', 5.43],
  ['.dark', 'brand-crimson-foreground', 'brand-crimson', 7.04],
  ['.dark', 'landing-field-foreground', 'landing-field', 17.22],
  ['.dark', 'landing-field-muted-foreground', 'landing-field', 6.09],
  ['.dark', 'brand-crimson', 'landing-background', 2.81],
  ['.dark', 'foreground', 'background', 17.9],
  ['.dark', 'foreground', 'card', 18.64],
  ['.dark', 'foreground', 'popover', 16.21],
  ['.dark', 'secondary-foreground', 'card', 9.95],
  ['.dark', 'secondary-foreground', 'popover', 8.65],
  ['.dark', 'muted-foreground', 'background', 5.33],
  ['.dark', 'muted-foreground', 'card', 5.55],
  ['.dark', 'muted-foreground', 'popover', 4.82],
  ['.dark', 'selection', 'background', 5.33],
  ['.dark', 'selection', 'card', 5.55],
  ['.dark', 'status-critical-foreground', 'status-critical-background', 4.9],
  ['.dark', 'status-warning-foreground', 'status-warning-background', 6.85],
  ['.dark', 'input', 'background', 3.41],
  ['.dark', 'input', 'card', 3.55],
  ['.light', 'foreground', 'background', 17.46],
  ['.light', 'foreground', 'card', 18.86],
  ['.light', 'muted-foreground', 'card', 6.05],
  ['.light', 'muted-foreground', 'background', 5.6],
  ['.light', 'muted-foreground', 'secondary', 5.32],
  ['.light', 'selection', 'card', 7.04],
  ['.light', 'selection', 'background', 6.52],
  ['.light', 'status-critical-foreground', 'status-critical-background', 7.41],
  ['.light', 'status-warning-foreground', 'status-warning-background', 4.62],
  ['.light', 'input', 'card', 3.28],
  ['.light', 'chart-3', 'card', 3.28],
  ['.dark.hc', 'muted-foreground', 'background', 14.17],
  ['.dark.hc', 'selection', 'background', 7.67],
  ['.dark.hc', 'warning', 'background', 12.9],
  ['.light.hc', 'muted-foreground', 'background', 14.16],
  ['.light.hc', 'selection', 'background', 9.4],
  ['.light.hc', 'warning', 'background', 8.48]
]

test.each(pairs)('%s: --%s on --%s matches DESIGN (%s)', (mode, foreground, background, ratio) => {
  const vars = { ...variables('.dark'), ...variables(mode) }
  expect(vars[foreground], foreground).toBeDefined()
  expect(vars[background], background).toBeDefined()
  const a = luminance(vars[foreground]!)
  const b = luminance(vars[background]!)
  const actual = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  expect(Math.abs(actual - ratio)).toBeLessThanOrEqual(0.01)
})
