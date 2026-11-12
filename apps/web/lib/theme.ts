export type Theme = 'dark' | 'light' | 'system'
export type Contrast = 'system' | 'standard' | 'more'
export type Motion = 'system' | 'reduce' | 'full'

export interface Appearance {
  theme: Theme
  contrast: Contrast
  motion: Motion
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'dark', contrast: 'system', motion: 'system' }

// The --ground of each theme in styles/globals.css (Dusk, Day and their high-contrast sets); the server sends the
// matching browser chrome colour. test/tokens/contrast.test.ts fails when the two drift apart.
export const THEME_COLORS = {
  dark: '#1a2039',
  light: '#fdeef3',
  darkHc: '#0b0e1f',
  lightHc: '#ffffff'
}

export function resolveAppearance(
  appearance: Appearance = DEFAULT_APPEARANCE,
  hints: { colorScheme?: string | null; contrast?: string | null; motion?: string | null } = {}
) {
  const light = appearance.theme === 'light' || (appearance.theme === 'system' && hints.colorScheme === 'light')
  const mode = light ? 'light' : 'dark'
  const hc = appearance.contrast === 'more' || (appearance.contrast === 'system' && hints.contrast === 'more')
  const reduce = appearance.motion === 'reduce' || (appearance.motion === 'system' && hints.motion === 'reduce')
  return {
    mode,
    className: hc ? `${mode} hc` : mode,
    motion: reduce ? 'reduce' : 'full',
    color: light ? (hc ? THEME_COLORS.lightHc : THEME_COLORS.light) : hc ? THEME_COLORS.darkHc : THEME_COLORS.dark
  }
}

// This runs in <head>, before the body paints. Attribute changes are the seam for #99's account preferences. A plain
// string, never `fn.toString()`: every bundler rewrites function text, which would break the CSP hash in
// features/hardening/security-headers.ts. test/hardening.test.ts recomputes the hash and fails when this changes.
export const APPEARANCE_SCRIPT = `(function (colors) {
  const root = document.documentElement
  const scheme = matchMedia('(prefers-color-scheme: light)')
  const contrast = matchMedia('(prefers-contrast: more)')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  function apply() {
    const light = root.dataset.theme === 'light' || (root.dataset.theme === 'system' && scheme.matches)
    const hc = root.dataset.contrast === 'more' || (root.dataset.contrast === 'system' && contrast.matches)
    const reduce =
      root.dataset.motionPreference === 'reduce' || (root.dataset.motionPreference === 'system' && motion.matches)
    root.classList.toggle('light', light)
    root.classList.toggle('dark', !light)
    root.classList.toggle('hc', hc)
    root.style.colorScheme = light ? 'light' : 'dark'
    root.dataset.motion = reduce ? 'reduce' : 'full'
    const meta = document.querySelector('meta[name="theme-color"]') || document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = light ? (hc ? colors.lightHc : colors.light) : hc ? colors.darkHc : colors.dark
    if (!meta.isConnected) document.head.append(meta)
  }
  apply()
  for (const query of [scheme, contrast, motion]) query.addEventListener('change', apply)
  new MutationObserver(apply).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-contrast', 'data-motion-preference']
  })
})(${JSON.stringify(THEME_COLORS)})`
