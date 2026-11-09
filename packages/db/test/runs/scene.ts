// #151 test helpers, for the worker and API run tests: the 2 November 2026 Sky run built from the JPS capture byte copy
// (`../fixtures/fixtures.json`), and the MET Thunderstorms Warning of 5 November verbatim. Values come from the captures;
// IDs are test rows. The clause engine (#131) isn't built, so the shadow verdicts below are what its port returns for
// these values under the published Sky default (storm_confirmed: w.rain_max_60m_mm >= 31.0). Tests only (NFR-15).
import { readFileSync } from 'node:fs'
import type { IndicatorSnapshot, Verdicts } from '@skyclause/clauses'
import type { Tx } from '../../src/client'
import { bundleScene, windowOf, type Scene } from '../bundles/scene'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
const utc = (myt: string) => new Date(`${myt}+08:00`).toISOString().replace('.000Z', 'Z')

/** The 15:05 MYT poll on 2 November 2026, which stored the 15:00 reading (D12). */
export const T_EVAL = utc('2026-11-02T15:05:00')
const OBSERVED = utc('2026-11-02T15:00:00')

/** The JPS gauge's 60-minute total over (14:00, 15:00] MYT on 2 November, from the capture: 39.0 mm. */
export function rainTotal(): number {
  const capture = JSON.parse(fixture('rainfall-graph-75-20261105T1312Z.json')) as {
    data: Array<{ timestamp: string; rf: number }>
  }
  return capture.data
    .filter((row) => row.timestamp > '2026-11-02T14:00:00' && row.timestamp <= '2026-11-02T15:00:00')
    .reduce((sum, row) => sum + row.rf, 0)
}

/** The Thunderstorms Warning issued 21:05 MYT on 5 November 2026, verbatim (LOC-3). */
export function thunderstormWarning(): string {
  const records = JSON.parse(fixture('weather-warning-20261105T1313Z.json')) as Array<{
    warning_issue: { title_en: string }
    text_en: string
  }>
  return records.find((record) => record.warning_issue.title_en === 'Thunderstorms Warning')!.text_en
}

/** The wave's title, which no prompt may carry (NFR-11). */
export const WAVE_TITLE = 'Quantum seminar release'

export interface RunScene extends Scene {
  /** The 15:30 MYT release wave, zero-length (D13). */
  windowId: string
}

/** A Sky project with its published default sheet (version 1) and the 15:30 MYT release wave on 2 November. */
export async function runScene(tx: Tx, o: { projectId?: string } = {}): Promise<RunScene> {
  const scene = await bundleScene(tx, o)
  const at = new Date(utc('2026-11-02T15:30:00'))
  const wave = await windowOf(tx, scene, at, at, WAVE_TITLE)
  return { ...scene, windowId: wave.id }
}

/** The snapshot SnapshotSource takes at 15:05: the gauge's total, fresh and 5 minutes old, and its window input. */
export function stormSnapshot(projectId: string, sourceId: string | null = null): IndicatorSnapshot {
  const fresh = (name: string) => ({ name, sourceId, state: 'fresh' as const, since: OBSERVED })
  return {
    projectId,
    pack: 'sky',
    tEval: T_EVAL,
    inputs: [fresh('site.rain_60m_mm'), fresh('w.rain_max_60m_mm')],
    site: {
      'site.rain_60m_mm': {
        name: 'site.rain_60m_mm',
        value: rainTotal(),
        unit: 'mm',
        state: 'fresh',
        since: OBSERVED,
        ageS: 300,
        sourceIds: sourceId ? [sourceId] : [],
        readingIds: [],
        observedAt: OBSERVED
      }
    },
    series: {},
    nights: [],
    registryHash: 'registry',
    hash: `snapshot-${T_EVAL}`
  }
}

/** The shadow verdicts for the wave: Storm confirmed fires on the window's 60-minute maximum, so Commute disruption. */
export function stormVerdicts(
  windowId: string,
  mode: 'commute_disruption' | 'normal' = 'commute_disruption'
): Verdicts {
  const fired = mode !== 'normal'
  return {
    tEval: T_EVAL,
    pack: 'sky',
    contentHash: 'content',
    snapshotHash: `snapshot-${T_EVAL}`,
    site: [],
    windows: [
      {
        scope: { kind: 'window', id: windowId },
        pack: 'sky',
        mode,
        watch: false,
        noCall: null,
        recommendations: [],
        clauses: [
          {
            key: 'storm_confirmed',
            result: fired ? 'fired' : 'not_fired',
            blockedBy: [],
            span: { from: utc('2026-11-02T15:00:00'), to: utc('2026-11-02T16:30:00'), complete: false },
            inputs: []
          }
        ],
        openFrom: null
      }
    ],
    nights: [],
    hash: `verdicts-${mode}-${windowId}`
  }
}

/** DESIGN "Voice and content": the 2 November replay's call wording, every number quotable from the snapshot. */
export const DESIGN_BODY =
  'Commute disruption for the 15:30 release wave, Monday 2 November 2026. Why: Storm confirmed, gauge 39.0 mm in 60 min to 15:00 (Lebat), 5 min old at the 15:05 poll.'

/** 21:13 MYT on 5 November 2026, when the warning capture was taken; the warning was issued at 21:05. */
export const WARNING_T_EVAL = utc('2026-11-05T21:13:00')
export const WARNING_ISSUED = utc('2026-11-05T21:05:00')

/** The site snapshot at the warning capture: `site.met_warning_in_force` true, read from the MET reading `readingId`. */
export function warningSnapshot(projectId: string, sourceId: string, readingId: string): IndicatorSnapshot {
  return {
    projectId,
    pack: 'sky',
    tEval: WARNING_T_EVAL,
    inputs: [{ name: 'site.met_warning_in_force', sourceId, state: 'fresh', since: WARNING_ISSUED }],
    site: {
      'site.met_warning_in_force': {
        name: 'site.met_warning_in_force',
        value: true,
        unit: '',
        state: 'fresh',
        since: WARNING_ISSUED,
        ageS: 480,
        sourceIds: [sourceId],
        readingIds: [readingId],
        observedAt: WARNING_ISSUED
      }
    },
    series: {},
    nights: [],
    registryHash: 'registry',
    hash: `snapshot-${WARNING_T_EVAL}`
  }
}

/** The site verdict at the warning capture: Normal, since no window is open (`storm_watch` is window-scope). */
export function normalSiteVerdicts(): Verdicts {
  return {
    tEval: WARNING_T_EVAL,
    pack: 'sky',
    contentHash: 'content',
    snapshotHash: `snapshot-${WARNING_T_EVAL}`,
    site: [
      {
        scope: { kind: 'site', id: null },
        pack: 'sky',
        mode: 'normal',
        watch: false,
        noCall: null,
        recommendations: [],
        clauses: [],
        openFrom: null
      }
    ],
    windows: [],
    nights: [],
    hash: `verdicts-site-${WARNING_T_EVAL}`
  }
}
