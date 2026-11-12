import { expect, test } from 'vitest'
import { routeGroupOf, vitalBody } from '../../features/quality/vitals'

test('the route group is the first route-group segment under the root layout', () => {
  expect(routeGroupOf(['(marketing)', 'pricing'])).toBe('marketing')
  expect(routeGroupOf(['(app)', 'acme', 'site'])).toBe('app')
  expect(routeGroupOf(['(embed)'])).toBe('embed')
})

test('a page outside the five route groups has no route group, so it sends no vital', () => {
  expect(routeGroupOf([])).toBeNull()
  expect(routeGroupOf(['health'])).toBeNull()
  expect(routeGroupOf(['(admin)', 'x'])).toBeNull()
})

test('a vital becomes the POST /e body of spec §2', () => {
  expect(vitalBody({ name: 'LCP', value: 1834.2 }, 'public')).toEqual({
    type: 'vital',
    metric: 'LCP',
    value: 1834.2,
    route_group: 'public'
  })
  expect(vitalBody({ name: 'CLS', value: 0.04 }, 'app')).toEqual({
    type: 'vital',
    metric: 'CLS',
    value: 0.04,
    route_group: 'app'
  })
})
