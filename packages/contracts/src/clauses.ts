import { z } from 'zod'
import type * as ClauseTypes from '../../clauses/src/types'

type ClauseType = ClauseTypes.Clause
type CrowdModeType = ClauseTypes.CrowdMode
type PackType = ClauseTypes.Pack
type RecommendationType = ClauseTypes.Recommendation
type SheetInputType = ClauseTypes.SheetInput
type SkyModeType = ClauseTypes.SkyMode
type SpanRefType = ClauseTypes.SpanRef

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type ExactList<A extends readonly string[], B> = Exact<A[number], B> extends true ? A : never

const PACKS = ['sky', 'crowd'] as const satisfies readonly PackType[]
const PACK_OPTIONS: ExactList<typeof PACKS, PackType> = PACKS
const MODES = [
  'normal',
  'outdoor_limited',
  'commute_disruption',
  'hybrid_recommended',
  'surge_night'
] as const satisfies readonly (SkyModeType | CrowdModeType)[]
const MODE_OPTIONS: ExactList<typeof MODES, SkyModeType | CrowdModeType> = MODES
const RECOMMENDATIONS = [
  'keep_with_advisory',
  'shift_start',
  'shift_end',
  'ask_shuttle',
  'leave_before_doors'
] as const satisfies readonly RecommendationType[]
const RECOMMENDATION_OPTIONS: ExactList<typeof RECOMMENDATIONS, RecommendationType> = RECOMMENDATIONS

export const SpanRef: z.ZodType<SpanRefType> = z.string().regex(/^(start|end)([+-]\d+m)?$/)
export const Clause: z.ZodType<ClauseType> = z.object({
  key: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  builtin: z.literal('silent_input').optional(),
  scope: z.enum(['site', 'window', 'night']),
  requires: z.array(z.string()),
  optional: z.array(z.string()).optional(),
  span: z.object({ from: SpanRef, to: SpanRef }).optional(),
  when: z.string(),
  expiry: z.enum(['start', 'end']).optional(),
  proposes: z.object({
    mode: z.enum(MODE_OPTIONS).optional(),
    watch: z.literal(true).optional(),
    recommendations: z.array(z.enum(RECOMMENDATION_OPTIONS)).optional(),
    note: z.enum(['flood_note', 'single_source_flag', 'calendar_entry']).optional()
  }),
  wording: z.object({ en: z.string().optional(), ms: z.string().optional() })
})
export const SheetInput: z.ZodType<SheetInputType> = z.object({ pack: z.enum(PACK_OPTIONS), clauses: z.array(Clause) })
