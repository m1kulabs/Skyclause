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

/** Spec §4 Hosts serve `/e` on the marketing host only; `app.` and `embed.` sit one label under it. */
export function vitalsEndpoint({ protocol, hostname }: { protocol: string; hostname: string }): string {
  const [first, ...rest] = hostname.split('.')
  return (first === 'app' || first === 'embed') && rest.length > 1 ? `${protocol}//${rest.join('.')}/e` : '/e'
}

/** One `sendBeacon` per metric as web-vitals reports it; a string body goes as text/plain, so no CORS preflight. */
export function reportVitals(group: RouteGroup) {
  const endpoint = vitalsEndpoint(location)
  const send = (metric: { name: VitalMetric; value: number }) =>
    navigator.sendBeacon(endpoint, JSON.stringify(vitalBody(metric, group)))
  onLCP(send)
  onINP(send)
  onCLS(send)
  onFCP(send)
  onTTFB(send)
}
