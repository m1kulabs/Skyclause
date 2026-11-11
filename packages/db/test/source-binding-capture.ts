import { readFileSync } from 'node:fs'

// Test-only decode of the byte-for-byte capture; #123's runtime parser has not merged.
export function capturedCa16w() {
  const capture = JSON.parse(
    readFileSync(new URL('./fixtures/mapcaqm-20261105T1313Z.json', import.meta.url), 'utf8')
  ) as {
    data: Array<{
      STATION_ID: string
      STATION_LOCATION: string
      LATITUDE: number
      LONGITUDE: number
      API: number
      RECORD_DT: string
    }>
  }
  const station = capture.data.find((row) => row.STATION_ID === 'CA16W')!
  return {
    kind: 'apims' as const,
    externalId: station.STATION_ID,
    name: station.STATION_LOCATION,
    lat: station.LATITUDE,
    lon: station.LONGITUDE,
    observedAt: new Date(`${station.RECORD_DT}+08:00`),
    value: station.API
  }
}
