export type Theme = 'dark' | 'light' | 'system'
export type Contrast = 'system' | 'standard' | 'more'
export type Motion = 'system' | 'reduce' | 'full'

export interface Appearance {
  theme: Theme
  contrast: Contrast
  motion: Motion
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'dark', contrast: 'system', motion: 'system' }

// Keep these grounds equal to DESIGN's CSS tokens; the server sends the matching browser chrome colour.
export const THEME_COLORS = {
  dark: '#171719',
  light: '#f6f6f7',
  darkHc: '#000000',
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

// This runs in <head>, before the body paints. Attribute changes are the seam for #99's account preferences.
function followSystem(colors: typeof THEME_COLORS) {
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
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = light ? (hc ? colors.lightHc : colors.light) : hc ? colors.darkHc : colors.dark
  }
  apply()
  for (const query of [scheme, contrast, motion]) query.addEventListener('change', apply)
  new MutationObserver(apply).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-contrast', 'data-motion-preference']
  })
}

export const APPEARANCE_SCRIPT = `(${followSystem.toString()})(${JSON.stringify(THEME_COLORS)})`
