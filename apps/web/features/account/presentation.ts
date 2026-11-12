import type { Preferences } from '@skyclause/contracts'
import { formatDateTime } from '@skyclause/i18n/format'
import { t } from '@skyclause/i18n'
import type { Appearance } from '../../lib/theme'

export function preferencesToAppearance(preferences: Preferences): Appearance {
  return {
    theme: preferences.theme,
    contrast: preferences.high_contrast ? 'more' : 'system',
    motion: preferences.reduced_motion ? 'reduce' : 'system'
  }
}

export function applyAccountPreferences(preferences: Preferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const appearance = preferencesToAppearance(preferences)
  root.dataset.theme = appearance.theme
  root.dataset.contrast = appearance.contrast
  root.dataset.motionPreference = appearance.motion
  root.dataset.density = preferences.density
  root.dataset.shortcuts = String(preferences.shortcuts)
  root.lang = preferences.language
}

export function presentSessionAgent(
  userAgent: string | null | undefined,
  locale: 'en' | 'ms' = 'en'
): { device: string; browser: string } {
  const unknownDevice = () => t('account-settings.security.unknownDevice', {}, locale)
  const unknownBrowser = () => t('account-settings.security.unknownBrowser', {}, locale)
  if (!userAgent) return { device: unknownDevice(), browser: unknownBrowser() }
  if (/skyclause(?:[- ]cli)/i.test(userAgent)) return { device: 'Skyclause CLI', browser: 'Skyclause CLI' }

  const device = /Windows NT/i.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : unknownDevice()
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /CriOS\//i.test(userAgent)
        ? 'Chrome'
        : /Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : unknownBrowser()
  return { device, browser }
}

export function formatSessionDate(value: string | Date, locale: 'en' | 'ms' = 'en'): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return t('account-settings.security.unknownTime', {}, locale)
  return formatDateTime(date, locale)
}
