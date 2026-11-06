import { expect, expectTypeOf, test } from 'vitest'
import { METRICS, type HeartbeatName, type SliStat } from '../src/metrics'

test('names each TRD SLI, web vitals and heartbeat metric', () => {
  expect(Object.values(METRICS)).toEqual([
    'skyclause.polls_on_schedule',
    'skyclause.reading_stored',
    'skyclause.reading_to_verdict',
    'skyclause.crossing_to_needs_review',
    'skyclause.approver_alerted',
    'skyclause.approval_to_provider',
    'skyclause.approval_sla',
    'skyclause.reading_to_shadow_verdict',
    'skyclause.source_freshness',
    'skyclause.app_api_mcp_availability',
    'skyclause.web_vitals',
    'skyclause.heartbeat'
  ])
})

test('keeps the existing heartbeat and SLI stat types available', () => {
  expectTypeOf<HeartbeatName>().toEqualTypeOf<'auditor' | 'minute_tick'>()
  expectTypeOf<'breach' extends SliStat ? true : false>().toEqualTypeOf<true>()
})
