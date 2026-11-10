import type { PreviewReads, PublicCall, PublicStatus, PublicWindow } from '../../features/share-previews/reads'

// Test doubles of #187's public reads (NFR-15: doubles only inside tests). The values follow DESIGN's 2 November
// example, so the expected strings below can be checked by hand.

type Pack = PublicStatus['packs'][number]

export const PROJECT = { id: '0192f0e4-0000-7000-8000-000000000001', slug: 'bukit-jalil', org_slug: 'apu' }

export function pack(o: Partial<Pack> & Pick<Pack, 'pack'>): Pack {
  return { basis: null, call_id: null, mode: null, watch: false, no_call: null, ...o }
}

export function rain60(observedAt: string, value: number): PublicStatus['strip'][number] {
  return {
    name: 'site.rain_60m_mm',
    value,
    unit: 'mm',
    state: 'fresh',
    since: null,
    age_s: 0,
    source_ids: ['src-jps-0232901RF'],
    source_url: 'https://publicinfobanjir.water.gov.my/',
    reading_ids: [],
    observed_at: observedAt
  }
}

export function status(o: Partial<PublicStatus> = {}): PublicStatus {
  return {
    state_version: 'v1',
    project: PROJECT,
    packs: [pack({ pack: 'sky' }), pack({ pack: 'crowd' })],
    verdicts: [],
    strip: [],
    ...o
  }
}

export function call(o: Partial<PublicCall> = {}): PublicCall {
  return {
    id: '0192f0e4-0000-7000-8000-0000000000c1',
    pack: 'sky',
    state: 'approved',
    mode: 'commute_disruption',
    watch: false,
    window: { starts_at: '2026-11-02T07:30:00Z', ends_at: '2026-11-02T09:00:00Z' },
    fired: [{ clause: 'storm_confirmed', inputs: [rain60('2026-11-02T07:00:00Z', 39)] }],
    approver_role: 'approver',
    approval_delay_s: 240,
    clause_version_n: 1,
    approved_at: '2026-11-02T07:12:00Z',
    sent_at: null,
    grade: null,
    ...o
  }
}

export function publicWindow(o: Partial<PublicWindow> = {}): PublicWindow {
  return {
    id: '0192f0e4-0000-7000-8000-0000000000a1',
    call_id: call().id,
    pack: 'sky',
    kind: 'commute_wave',
    starts_at: '2026-11-02T07:30:00Z',
    ends_at: '2026-11-02T09:00:00Z',
    mode: 'commute_disruption',
    watch: false,
    permalink: `https://skyclause.m1ku.tech/c/${call().id}`,
    ...o
  }
}

/** Reads over fixed rows: anything not listed is null, as #187 answers private, guest and missing IDs alike. */
export function readsOf(rows: {
  status?: PublicStatus | (() => PublicStatus)
  calls?: PublicCall[]
  windows?: PublicWindow[]
}): PreviewReads {
  return {
    async projectStatus(org, project) {
      const found = typeof rows.status === 'function' ? rows.status() : rows.status
      return found && found.project.org_slug === org && found.project.slug === project ? found : null
    },
    async call(callId) {
      return rows.calls?.find((row) => row.id === callId) ?? null
    },
    async window(id) {
      return rows.windows?.find((row) => row.id === id) ?? null
    }
  }
}
