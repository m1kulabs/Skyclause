export interface PickerSource {
  id: string
  kind: string
  external_id: string
  name: string
  lat: number | null
  lon: number | null
  url: string
  cadence_s: number
  stale_after_s: number
  licence_id: string | null
  licence_label: string
  latest_reading: {
    id: string
    source_id: string
    poll_id: string | null
    metric: string
    unit: string | null
    observed_at: string
    received_at: string
    value: number | null
    value_text: string | null
    value_json: unknown
    device_time: string | null
    item_key: string | null
    revision: string
  } | null
  age_s: number | null
  source_state: { state: string; since: string; http_status: number | null; pending_until: string | null } | null
}

export interface SitePoint {
  lat: number
  lon: number
}

const EARTH_RADIUS_KM = 6371.0088

export function distanceKm(site: SitePoint, source: Pick<PickerSource, 'lat' | 'lon'>): number {
  if (source.lat === null || source.lon === null) return Number.POSITIVE_INFINITY
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(source.lat - site.lat)
  const longitudeDelta = radians(source.lon - site.lon)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(site.lat)) * Math.cos(radians(source.lat)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Keep the compact picker label from rounding a distance up to the next tenth. */
export function formatDistanceKm(distance: number): string {
  return (Math.floor(distance * 10) / 10).toFixed(1)
}

export function sortSources<Source extends PickerSource>(sources: Source[], site: SitePoint): Source[] {
  return [...sources].sort((left, right) => {
    const delta = distanceKm(site, left) - distanceKm(site, right)
    return Number.isNaN(delta) || delta === 0 ? left.external_id.localeCompare(right.external_id) : delta
  })
}

export function filterSources<Source extends PickerSource>(sources: Source[], query: string): Source[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return sources
  return sources.filter(
    (source) =>
      source.name.toLocaleLowerCase().includes(normalized) ||
      source.external_id.toLocaleLowerCase().includes(normalized)
  )
}

export function progressForSteps(steps: Array<{ completed_at: string | null; skipped: boolean }>) {
  const completed = steps.filter((step) => !!step.completed_at || step.skipped).length
  const total = steps.length
  return { completed, total, percentage: total === 0 ? 0 : (completed / total) * 100 }
}

export function cadenceLabel(seconds: number): 'minute' | 'hour' | 'day' | 'interval' {
  if (seconds % 86400 === 0) return seconds === 86400 ? 'day' : 'interval'
  if (seconds % 3600 === 0) return seconds === 3600 ? 'hour' : 'interval'
  if (seconds % 60 === 0) return seconds === 60 ? 'minute' : 'interval'
  return 'interval'
}

export function ageLabel(seconds: number | null): string | null {
  if (seconds === null) return null
  if (seconds < 90 * 60) return `${Math.max(1, Math.floor(seconds / 60))} min`
  if (seconds < 36 * 3600) return `${Math.floor(seconds / 3600)} h`
  return `${Math.floor(seconds / 86400)} d`
}
