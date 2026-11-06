import { describe, expect, test } from 'vitest'
import { contrast, daylight, deviceTime, nextMark, ratios, uuid7, validRegion } from '../../features/camera/model'

describe('camera MYT clock', () => {
  test('marks start at 07:15 and repeat every ten minutes strictly before dusk', () => {
    expect(nextMark(Date.parse('2026-11-06T07:14:59+08:00'), '07:15', '19:00')).toBe(
      Date.parse('2026-11-06T07:15:00+08:00')
    )
    expect(nextMark(Date.parse('2026-11-06T07:15:00+08:00'), '07:15', '19:00')).toBe(
      Date.parse('2026-11-06T07:25:00+08:00')
    )
    expect(nextMark(Date.parse('2026-11-06T18:55:00+08:00'), '07:15', '19:00')).toBe(
      Date.parse('2026-11-07T07:15:00+08:00')
    )
    expect(daylight(Date.parse('2026-11-06T19:00:00+08:00'), '07:15', '19:00')).toBe(false)
    expect(daylight(Date.parse('2026-11-06T07:14:59+08:00'), '07:15', '19:00')).toBe(false)
    expect(daylight(Date.parse('2026-11-06T07:15:00+08:00'), '07:15', '19:00')).toBe(true)
  })
  test('capture times retain an explicit +08:00 offset', () => {
    expect(deviceTime(Date.parse('2026-11-05T23:15:00Z'))).toBe('2026-11-06T07:15:00.000+08:00')
  })
  test('capture IDs are ordered UUIDv7 values, including in the same millisecond', () => {
    const ids = Array.from({ length: 10 }, () => uuid7(1793920500000))
    expect(ids).toEqual([...ids].sort())
    expect(new Set(ids).size).toBe(10)
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(
      true
    )
  })
})

test('contrast is population luma deviation divided by mean; zero reference refuses scoring', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255])
  expect(contrast({ data: pixels, width: 2, height: 1 }, { x: 0, y: 0, width: 1, height: 1 })).toBeCloseTo(1)
  expect(ratios(0.6, 0.24, 1, 0.5)).toEqual({ ratio_near: 0.6, ratio_far: 0.48, flag: 'obscured' })
  expect(ratios(1, 0.5, 1, 1).flag).toBe('visible')
  expect(() => ratios(1, 1, 0, 1)).toThrow()
})

test('regions must have area and remain in the upper two thirds', () => {
  expect(validRegion({ x: 0, y: 0, width: 1, height: 2 / 3 })).toBe(true)
  for (const region of [
    { x: 0, y: 0.6, width: 0.1, height: 0.1 },
    { x: -0.1, y: 0, width: 0.2, height: 0.2 },
    { x: 0, y: 0, width: 0, height: 0.1 },
    { x: NaN, y: 0, width: 0.1, height: 0.1 }
  ])
    expect(validRegion(region)).toBe(false)
})
