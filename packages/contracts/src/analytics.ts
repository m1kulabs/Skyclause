// Spec §2 `analytics.ts`: the web-vitals half of the `POST /e` body. The PRD analytics events join it with #87.
// Plain constants and types, so a browser beacon imports them without a schema library.

export const VITAL_METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
export type VitalMetric = (typeof VITAL_METRICS)[number]

export const ROUTE_GROUPS = ['marketing', 'public', 'auth', 'app', 'embed'] as const
export type RouteGroup = (typeof ROUTE_GROUPS)[number]

export interface VitalBody {
  type: 'vital'
  metric: VitalMetric
  value: number
  route_group: RouteGroup
}
