import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  applyAccountPreferences,
  preferencesToAppearance,
  presentSessionAgent,
  formatSessionDate
} from '../../features/account/presentation'
import { DEFAULT_PREFERENCES } from '@skyclause/contracts'
import '../../features/settings/catalogue'

afterEach(() => vi.unstubAllGlobals())

describe('account settings presentation', () => {
  test('maps stored appearance values to the first-paint appearance provider', () => {
    expect(preferencesToAppearance(DEFAULT_PREFERENCES)).toEqual({
      theme: 'dark',
      contrast: 'system',
      motion: 'system'
    })
    expect(
      preferencesToAppearance({
        ...DEFAULT_PREFERENCES,
        theme: 'system',
        high_contrast: true,
        reduced_motion: true
      })
    ).toEqual({ theme: 'system', contrast: 'more', motion: 'reduce' })
  })

  test('names CLI sessions and identifies browser and device from their user agent', () => {
    expect(presentSessionAgent('Skyclause-CLI/1.2.3 (linux; x64)')).toEqual({
      device: 'Skyclause CLI',
      browser: 'Skyclause CLI'
    })
    expect(
      presentSessionAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36')
    ).toEqual({
      device: 'Windows',
      browser: 'Chrome'
    })
  })

  test('formats session timestamps in Malaysia time', () => {
    expect(formatSessionDate('2026-11-10T13:30:00.000Z')).toBe('10 November 2026, 21:30 MYT')
  })

  test('writes session dates and unknown devices in the reader’s language', () => {
    expect(formatSessionDate('2026-11-10T13:30:00.000Z', 'ms')).toBe('10 November 2026, 21:30 MYT')
    expect(formatSessionDate('not a date', 'ms')).toBe('Masa tidak diketahui · MYT')
    expect(presentSessionAgent('curl/8.0', 'ms')).toEqual({
      device: 'Peranti tidak diketahui',
      browser: 'Pelayar tidak diketahui'
    })
    expect(presentSessionAgent(null)).toEqual({ device: 'Unknown device', browser: 'Unknown browser' })
  })

  test('applies saved display choices to the current document, leaving lang to the rendered page', () => {
    const root = { dataset: {} as Record<string, string>, lang: '' }
    vi.stubGlobal('document', { documentElement: root })
    applyAccountPreferences({
      ...DEFAULT_PREFERENCES,
      theme: 'system',
      high_contrast: true,
      density: 'compact',
      reduced_motion: true,
      language: 'ms',
      shortcuts: false
    })

    expect(root).toMatchObject({
      lang: '',
      dataset: {
        theme: 'system',
        contrast: 'more',
        motionPreference: 'reduce',
        density: 'compact',
        shortcuts: 'false'
      }
    })
    expect(root.dataset).not.toHaveProperty('sidebarCollapsed')
  })
})
