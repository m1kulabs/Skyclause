import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { THEME_COLORS } from '../../lib/theme'

const css = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8')

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({
  selectors: rule[1]!
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((item) => item.trim()),
  vars: Object.fromEntries([...rule[2]!.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}))

/** The custom properties of the first rule whose selector list is exactly `selectors`. */
function block(...selectors: string[]): Record<string, string> {
  const match = rules.find((rule) => rule.selectors.join('|') === selectors.join('|'))
  if (!match) throw new Error(`Missing CSS rule: ${selectors.join(', ')}`)
  return match.vars
}

const dusk = block(':root', '.dark', "[data-surface='marketing']", "[data-surface='auth']")
const aliases = block(':root', '.dark', '.light', "[data-surface='marketing']", "[data-surface='auth']")
const themes = {
  dusk: { ...dusk },
  day: { ...dusk, ...block('.light') },
  'high-contrast dusk': {
    ...dusk,
    ...block('.dark.hc', ".hc [data-surface='marketing']", ".hc [data-surface='auth']")
  },
  'high-contrast day': { ...dusk, ...block('.light.hc') }
} as const
type Theme = keyof typeof themes

/** A token's colour in a theme, following var() through the theme's roles and the shared aliases. */
function colour(theme: Theme, name: string, depth = 0): string {
  const value = (themes[theme] as Record<string, string>)[name] ?? aliases[name]
  if (value === undefined) throw new Error(`--${name} is not set in ${theme}`)
  const reference = value.match(/^var\(--([\w-]+)\)$/)
  if (reference && depth < 8) return colour(theme, reference[1]!, depth + 1)
  if (!/^#[a-f\d]{6}$/i.test(value) && value !== 'transparent') throw new Error(`--${name} is ${value} in ${theme}`)
  return value
}

function luminance(hex: string): number {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = parseInt(value, 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const lightness = (hex: string) => 116 * Math.cbrt(luminance(hex)) - 16

const steps = ['ground', 'surface', 'raised'] as const
const hues = ['outdoor-limited', 'commute-disruption', 'hybrid-recommended', 'surge-night'] as const

// Text: ink everywhere (overlay too, the hover fill), muted on the three steps, and every filled pair the UI sets.
const textPairs: Array<[string, string]> = [
  ...[...steps, 'overlay'].map((ground): [string, string] => ['ink', ground]),
  ...steps.map((ground): [string, string] => ['ink-muted', ground]),
  ['primary-foreground', 'primary'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'popover'],
  ['muted-foreground', 'muted'],
  ['landing-foreground', 'landing-background'],
  ['landing-muted-foreground', 'landing-surface'],
  ['landing-field-foreground', 'landing-field'],
  ['mode-normal-ink', 'mode-normal'],
  ['mode-expired-ink', 'mode-expired'],
  ['mode-rejected-ink', 'mode-rejected'],
  ...hues.map((hue): [string, string] => [`mode-${hue}-ink`, `mode-${hue}`])
]

describe.each(Object.keys(themes) as Theme[])('%s', (theme) => {
  const floor = theme.startsWith('high-contrast') ? 7 : 4.5

  test.each(textPairs)(`--%s on --%s holds the text floor`, (foreground, background) => {
    expect(ratio(colour(theme, foreground), colour(theme, background))).toBeGreaterThanOrEqual(floor)
  })

  // Controls and data marks are not surfaces: their edge, the focus ring and the chart marks reach 3:1 on every step.
  test.each(['border', 'input', 'control-edge', 'focus', 'ring', 'mode-normal-edge', 'chart-emphasis', 'chart-ink'])(
    '--%s reaches 3:1 on every step',
    (mark) => {
      for (const ground of steps)
        expect(ratio(colour(theme, mark), colour(theme, ground)), ground).toBeGreaterThanOrEqual(3)
    }
  )

  test.each(hues)('the %s capsule stands out by its fill or by its edge', (hue) => {
    const edge = colour(theme, `mode-${hue}-edge`)
    for (const ground of ['ground', 'surface'] as const) {
      const fill = ratio(colour(theme, `mode-${hue}`), colour(theme, ground))
      if (edge === 'transparent') expect(fill, ground).toBeGreaterThanOrEqual(3)
      else expect(ratio(edge, colour(theme, ground)), ground).toBeGreaterThanOrEqual(3)
    }
  })

  // Adjacent rising modes differ mainly in lightness, so the ramp steps by at least 10 L* and never by hue alone.
  test('the Sky ramp falls in lightness by 10 L* or more per step', () => {
    const ramp = ['outdoor-limited', 'commute-disruption', 'hybrid-recommended'].map((hue) =>
      lightness(colour(theme, `mode-${hue}`))
    )
    if (theme.startsWith('high-contrast')) return expect(ramp[0]! - ramp[2]!).toBeGreaterThanOrEqual(10)
    expect(ramp[0]! - ramp[1]!).toBeGreaterThanOrEqual(10)
    expect(ramp[1]! - ramp[2]!).toBeGreaterThanOrEqual(10)
  })
})

test('the system theme repeats Day for a light OS, value for value', () => {
  const system = block("html[data-theme='system']")
  const day = block('.light')
  for (const [name, value] of Object.entries(day)) expect(system[name], name).toBe(value)
})

test("the browser chrome colour is each theme's ground", () => {
  expect(THEME_COLORS).toEqual({
    dark: colour('dusk', 'ground'),
    light: colour('day', 'ground'),
    darkHc: colour('high-contrast dusk', 'ground'),
    lightHc: colour('high-contrast day', 'ground')
  })
})

test('a nested .dark or .light resolves the aliases itself, so a preview of another theme reads its own roles', () => {
  const scoped = rules.find((rule) => rule.selectors.includes('.light') && 'card' in rule.vars)
  expect(scoped?.selectors).toEqual(expect.arrayContaining([':root', '.dark', '.light']))
  expect(scoped?.vars['card']).toBe('var(--surface)')
  expect(scoped?.vars['foreground']).toBe('var(--ink)')
})
