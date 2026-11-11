import { describe, expect, test } from 'vitest'
import { agreementInterval, parseView, wilson } from '../../features/probation/model'

describe('probation view state', () => {
  test('unknown and missing views fall back to labelling', () => {
    expect(parseView(undefined)).toBe('label')
    expect(parseView('resolve')).toBe('resolve')
    expect(parseView('progress')).toBe('progress')
    expect(parseView('charts')).toBe('label')
  })
})

describe('probation Wilson interval', () => {
  test('matches the platform regressions: 40 of 50 and 7 of 8', () => {
    expect(wilson(40, 50)).toEqual({ lo: 0.67, hi: 0.89 })
    expect(wilson(7, 8)).toEqual({ lo: 0.53, hi: 0.98 })
  })
  test('needs trials and a finite count; never a bare percentage', () => {
    expect(wilson(0, 0)).toBeNull()
    expect(wilson(3, -1)).toBeNull()
    expect(agreementInterval(null, 40)).toBeNull()
    expect(agreementInterval(0.93, 0)).toBeNull()
  })
  test('counts the agreement rate as whole settled frames', () => {
    expect(agreementInterval(0.93, 100)).toEqual(wilson(93, 100))
    expect(agreementInterval(0, 100)).toEqual(wilson(0, 100))
  })
})
