import { ROUTE_GROUPS, type RouteGroup, type VitalBody, type VitalMetric } from '@skyclause/contracts/analytics'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'

/** Extract a known route group from Next layout segments; null outside the five. */
export function routeGroupOf(segments: readonly string[]): RouteGroup | null {
  for (const segment of segments) {
    const match = /^\((.+)\)$/.exec(segment)
    if (match) return ROUTE_GROUPS.find((group) => group === match[1]) ?? null
  }
  return null
}

export function vitalBody(metric: { name: VitalMetric; value: number }, group: RouteGroup): VitalBody {
  return { type: 'vital', metric: metric.name, value: metric.value, route_group: group }
}

/**
 * One `sendBeacon` per metric as web-vitals reports it, to the page's own origin: every host serves `/e` (spec §4
 * Hosts), and its CSP's `connect-src 'self'` allows it. A string body goes as text/plain, so no CORS preflight.
 */
export function reportVitals(group: RouteGroup) {
  const send = (metric: { name: VitalMetric; value: number }) =>
    navigator.sendBeacon('/e', JSON.stringify(vitalBody(metric, group)))
  onLCP(send)
  onINP(send)
  onCLS(send)
  onFCP(send)
  onTTFB(send)
}
