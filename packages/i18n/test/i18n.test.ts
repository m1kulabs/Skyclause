import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { t } from '@skyclause/i18n'
import {
  formatAge,
  formatDate,
  formatDateKeyAt,
  formatDateLong,
  formatDateTime,
  formatList,
  formatNumber,
  formatTime,
  formatTimeZoneName
} from '@skyclause/i18n/format'
import { catalogueFiles } from '../src/catalogue'
import { pseudo } from '../src/pseudo'

const instant = new Date('2026-11-02T07:00:00Z')

describe('MYT formatters', () => {
  test('formats dates and times in English and Malay', () => {
    expect(formatTime(instant, 'en')).toBe('15:00 MYT')
    expect(formatDate(instant, 'en')).toBe('2 November 2026')
    expect(formatDateLong(instant, 'en')).toBe('Monday 2 November 2026')
    expect(formatDateTime(instant, 'en')).toBe('2 November 2026, 15:00 MYT')

    expect(formatTime(instant, 'ms')).toBe('15:00 MYT')
    expect(formatDate(instant, 'ms')).toBe('2 November 2026')
    expect(formatDateLong(instant, 'ms')).toBe('Isnin 2 November 2026')
    expect(formatDateTime(instant, 'ms')).toBe('2 November 2026, 15:00 MYT')
  })

  test('formats project-local date keys, lists and time-zone labels', () => {
    expect(formatDateKeyAt(new Date('2026-11-05T16:30:00Z'), 'Asia/Kuala_Lumpur')).toBe('2026-11-06')
    expect(formatDateKeyAt(new Date('2026-11-05T16:30:00Z'), 'America/Los_Angeles')).toBe('2026-11-05')
    expect(formatList(['Monday', 'Tuesday'], 'en')).toBe('Monday and Tuesday')
    expect(formatTimeZoneName('Asia/Kuala_Lumpur', 'en')).toBe('MYT')
  })

  test('formats numbers by locale', () => {
    expect(formatNumber(1234.5, 'en')).toBe(new Intl.NumberFormat('en-MY').format(1234.5))
    expect(formatNumber(1234.5, 'ms')).toBe(new Intl.NumberFormat('ms-MY').format(1234.5))
  })

  describe('ages', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
    })

    afterEach(() => vi.useRealTimers())

    test('formats minute and hour thresholds in both locales', () => {
      expect(formatAge(new Date(Date.now() - 59_000), 'en')).toBe('1 min old')
      expect(formatAge(new Date(Date.now() - 12 * 60_000), 'en')).toBe('12 min old')
      expect(formatAge(new Date(Date.now() - 90 * 60_000), 'en')).toBe('90 min old')
      expect(formatAge(new Date(Date.now() - 91 * 60_000), 'en')).toBe('2 h old')

      expect(formatAge(new Date(Date.now() - 59_000), 'ms')).toBe('1 minit lalu')
      expect(formatAge(new Date(Date.now() - 12 * 60_000), 'ms')).toBe('12 minit lalu')
      expect(formatAge(new Date(Date.now() - 90 * 60_000), 'ms')).toBe('90 minit lalu')
      expect(formatAge(new Date(Date.now() - 91 * 60_000), 'ms')).toBe('2 jam lalu')
    })
  })
})

describe('catalogue translations', () => {
  test('interpolates named values', () => {
    expect(t('format.ageMinute', { value: 12 }, 'en')).toBe('12 min old')
  })

  test('falls back to English when a Malay value is missing', () => {
    const malayFormat = catalogueFiles['../catalogue/ms/format.json'] as { default: { zone?: string } }
    const zone = malayFormat.default.zone
    delete malayFormat.default.zone

    try {
      expect(t('format.zone', {}, 'ms')).toBe('MYT')
    } finally {
      malayFormat.default.zone = zone
    }
  })

  test('throws for a missing key outside production and returns its key in production', () => {
    expect(() => t('missing.value')).toThrow(/missing\.value/)

    vi.stubEnv('NODE_ENV', 'production')
    expect(t('missing.value')).toBe('missing.value')
    vi.unstubAllEnvs()
  })
})

test('pseudo lengthens strings by 30 percent, rounded up to a whole character', () => {
  expect(pseudo('abcdefghij')).toHaveLength(13)
  expect(pseudo('')).toBe('')
})

test('the test-build flag lengthens translated copy after interpolation', () => {
  vi.stubEnv('NEXT_PUBLIC_SKYCLAUSE_PSEUDO', '1')
  try {
    expect(t('shell.skip_to_content')).toBe(pseudo('Skip to content'))
    expect(t('format.ageMinute', { value: 12 })).toBe(pseudo('12 min old'))
  } finally {
    vi.unstubAllEnvs()
  }
})
