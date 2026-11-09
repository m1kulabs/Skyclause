import { z } from 'zod'

// TRD 'Agent inputs and output schema', copied without schema examples (NFR-15).
const Notice = z.object({ language: z.enum(['en', 'ms']), subject: z.string().max(120), body: z.string().max(2000) })
const Call = z.object({
  window_id: z.string(),
  mode: z.enum(['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended', 'surge_night']).nullable(),
  watch: z.boolean(),
  no_call: z.array(z.string()).nullable(),
  fired: z.array(z.object({ clause: z.string(), inputs: z.array(z.string()) })),
  recommendations: z.array(
    z.enum(['keep_with_advisory', 'shift_start', 'shift_end', 'ask_shuttle', 'leave_before_doors'])
  ),
  recipients: z.array(z.string()),
  notices: z.array(Notice),
  reason: z.string().max(1500)
})
export const ProposedBundle = z.object({
  pack: z.enum(['sky', 'crowd']),
  calls: z.array(Call),
  items: z.array(z.object({ kind: z.literal('surge_night_entry'), night_id: z.string() }))
})
export type ProposedBundle = z.infer<typeof ProposedBundle>

type Pack = 'sky' | 'crowd'
type InputState = 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
type InputStatus = { name: string; sourceId: string | null; state: InputState; since: string }
type IndicatorValue = {
  name: string
  value: number | boolean | string | number[] | null
  unit: string
  state: InputState
  since: string | null
  ageS: number | null
  sourceIds: string[]
  readingIds: string[]
  observedAt: string | null
}

// Spec §1 adds malay_reader and the URL allow-lists; TRD NFR-11 excludes personal fields.
export interface AgentInput {
  pack: Pack
  sheet: {
    pack: Pack
    clauses: Array<{ key: string; when: string; wording: { en?: string; ms?: string } }>
  }
  snapshot: {
    projectId: string
    pack: Pack
    tEval: string
    inputs: InputStatus[]
    site: Record<string, IndicatorValue>
    series: Record<string, Array<[string, number | null, string]>>
    nights: Array<{
      id: string
      date: string
      baseline: number | null
      uplift: number | null
      forecast: number | null
      band: { low: number; high: number } | null
      doors: string | null
      show: string | null
      arrivalStart: string
      arrivalEnd: string | null
      exitStart: string | null
      exitEnd: string | null
      singleSource: boolean
      forecastId: string | null
      state: InputState | 'insufficient_baseline' | 'unclassed_show' | 'no_class_history' | 'stale_exits'
    }>
    registryHash: string
    hash: string
  }
  met_warnings: string[]
  // Third-party free text, untrusted like `met_warnings`: serialised as data blocks, never quotable.
  listings?: string[]
  forwarded_emails?: string[]
  evidence_requests?: string[]
  windows: Array<{ id: string; starts_at: string; ends_at: string }>
  candidates: Record<string, Array<{ id: string; role?: string; language: 'en' | 'ms' }>>
  yesterday_grades: Array<{ window_id: string; outcome: string }>
  quotable: string[]
  malay_reader: boolean
  source_urls: string[]
  origins: string[]
}
