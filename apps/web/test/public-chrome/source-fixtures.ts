import type { Source, SourceKind } from '@skyclause/contracts'

export const sourceKinds: SourceKind[] = [
  'jps_rain',
  'met_warning',
  'met_forecast',
  'apims',
  'rapidrail_od',
  'gtfs_static',
  'gtfs_rt',
  'golive',
  'wikipedia',
  'camera',
  'pi'
]

export function sourceFixture(kind: SourceKind): Source {
  const derived = ['jps_rain', 'apims', 'golive', 'camera', 'pi'].includes(kind)
  return {
    id: `source-${kind}`,
    kind,
    external_id: kind === 'jps_rain' ? '0232901RF' : `station-${kind}`,
    owner_org_id: null,
    name: `Test source ${kind}`,
    lat: null,
    lon: null,
    url: `https://source.example.test/${kind}`,
    cadence_s: 300,
    stale_after_s: 600,
    licence_id: derived ? 'derived-only' : kind === 'wikipedia' ? 'cc-by-sa-4.0' : 'cc-by-4.0',
    licence_label: derived ? 'Derived only' : kind === 'wikipedia' ? 'CC BY-SA 4.0' : 'CC BY 4.0'
  }
}

export const sourceFixtures = sourceKinds.map(sourceFixture)
