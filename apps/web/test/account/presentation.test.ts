import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  applyAccountPreferences,
  preferencesToAppearance,
  presentSessionAgent,
  formatSessionDate
} from '../../features/account/presentation'
import { DEFAULT_PREFERENCES } from '@skyclause/contracts'

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

  test('applies saved display choices to the current document and shell', () => {
    const root = { dataset: {} as Record<string, string>, lang: '' }
    const dispatchEvent = vi.fn()
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('window', { dispatchEvent })
    applyAccountPreferences({
      ...DEFAULT_PREFERENCES,
      theme: 'system',
      high_contrast: true,
      density: 'compact',
      reduced_motion: true,
      language: 'ms',
      shortcuts: false,
      sidebar_collapsed: true
    })

    expect(root).toMatchObject({
      lang: 'ms',
      dataset: {
        theme: 'system',
        contrast: 'more',
        motionPreference: 'reduce',
        density: 'compact',
        shortcuts: 'false',
        sidebarCollapsed: 'true'
      }
    })
    expect(dispatchEvent).toHaveBeenCalledOnce()
  })
})
