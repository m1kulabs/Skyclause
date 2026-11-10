// #162 c-analysis-api: Wilson's score interval (TRD grading, z = 1.96) and the quantile the delay figures use. Pure.
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { quantile, wilson } from '../src/analysis'

describe('wilson', () => {
  test('40 of 50 gives 0.67–0.89 and 7 of 8 gives 0.53–0.98 (#79 Testing Decisions)', () => {
    const forty = wilson(40, 50)!
    expect(forty.low).toBeCloseTo(0.67, 2)
    expect(forty.high).toBeCloseTo(0.89, 2)
    const seven = wilson(7, 8)!
    expect(seven.low).toBeCloseTo(0.53, 2)
    expect(seven.high).toBeCloseTo(0.98, 2)
  })

  test('NIST/SEMATECH 7.2.4.1: p̂ = 0.13 of n = 200 at one-sided z = 1.645 has lower limit 0.09577', () => {
    expect(wilson(26, 200, 1.645)!.low).toBeCloseTo(0.09577, 5)
  })

  test('0 of n has low 0 and high z² ÷ (n + z²); n of n mirrors it', () => {
    expect(wilson(0, 20)).toEqual({ low: 0, high: expect.closeTo(3.8416 / 23.8416, 12) })
    expect(wilson(20, 20)).toEqual({ low: expect.closeTo(20 / 23.8416, 12), high: 1 })
  })

  test('n = 0 has no interval', () => {
    expect(wilson(0, 0)).toBeNull()
  })

  test('refuses counts that are not a proportion', () => {
    expect(() => wilson(3, 2)).toThrow()
    expect(() => wilson(-1, 2)).toThrow()
    expect(() => wilson(1.5, 2)).toThrow()
  })

  test('property: 0 ≤ low ≤ x/n ≤ high ≤ 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }).chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n))),
        ([x, n]) => {
          const { low, high } = wilson(x, n)!
          expect(0 <= low && low <= x / n && x / n <= high && high <= 1).toBe(true)
        }
      )
    )
  })
})

describe('quantile', () => {
  test('interpolates between the closest ranks', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85, 12)
    expect(quantile([7], 0.95)).toBe(7)
  })

  test('sorts its input and has no value for none', () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5)
    expect(quantile([], 0.5)).toBeNull()
  })
})
