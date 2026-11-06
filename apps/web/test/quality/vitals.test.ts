import { expect, test } from 'vitest'
import { routeGroupOf, vitalBody, vitalsEndpoint } from '../../features/quality/vitals'

test('the route group is the first route-group segment under the root layout', () => {
  expect(routeGroupOf(['(marketing)', 'pricing'])).toBe('marketing')
  expect(routeGroupOf(['(app)', 'acme', 'site'])).toBe('app')
  expect(routeGroupOf(['(embed)'])).toBe('embed')
})

test('a page outside the five route groups has no route group, so it sends no vital', () => {
  expect(routeGroupOf([])).toBeNull()
  expect(routeGroupOf(['healthz'])).toBeNull()
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

test('the marketing host, and any single-origin deploy, beacon to their own /e', () => {
  expect(vitalsEndpoint({ protocol: 'https:', hostname: 'skyclause.m1ku.tech' })).toBe('/e')
  expect(vitalsEndpoint({ protocol: 'https:', hostname: 'web-abc123-as.a.run.app' })).toBe('/e')
  expect(vitalsEndpoint({ protocol: 'http:', hostname: 'localhost' })).toBe('/e')
})

test('the app and embed hosts beacon to /e on the marketing host, the only host that serves it (§4 Hosts)', () => {
  expect(vitalsEndpoint({ protocol: 'https:', hostname: 'app.skyclause.m1ku.tech' })).toBe(
    'https://skyclause.m1ku.tech/e'
  )
  expect(vitalsEndpoint({ protocol: 'https:', hostname: 'embed.skyclause.m1ku.tech' })).toBe(
    'https://skyclause.m1ku.tech/e'
  )
})
