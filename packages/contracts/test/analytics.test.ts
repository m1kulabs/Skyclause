import { expect, expectTypeOf, test } from 'vitest'
import {
  ANALYTICS_EVENT_TYPES,
  type AnalyticsBody,
  type AnalyticsEvent,
  type VitalBody,
  ROUTE_GROUPS,
  VITAL_METRICS
} from '../src/analytics'

type ExpectedAnalyticsEvent =
  | {
      name: 'landing_window_set'
      props: {
        modes: Array<'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'>
        inputs_fresh: number
        inputs_error: number
      }
    }
  | { name: 'guest_started'; props: { bot_check: 'passed' | 'failed' } }
  | { name: 'signed_up'; props: { method: 'magic_link' | 'google' | 'passkey'; from_guest: boolean } }
  | { name: 'org_created'; props: { plan: 'community' | 'team' | 'campus' | 'commons' } }
  | { name: 'project_created'; props: { packs: Array<'sky' | 'crowd'> } }
  | {
      name: 'source_bound'
      props: {
        adapter:
          | 'jps_rain'
          | 'met_warning'
          | 'met_forecast'
          | 'apims'
          | 'rapidrail_od'
          | 'gtfs_static'
          | 'gtfs_rt'
          | 'golive'
          | 'wikipedia'
          | 'camera'
          | 'pi'
        cadence_min: number
      }
    }
  | { name: 'rota_set'; props: { shifts: number; conditional: boolean } }
  | { name: 'channel_connected'; props: { channel: 'email' | 'ics' | 'webhook' | 'in_app' } }
  | {
      name: 'onboarding_step'
      props: {
        step: 'org_created' | 'project_created' | 'source_bound' | 'window_declared' | 'rota_set' | 'channel_connected'
        skipped: boolean
      }
    }
  | {
      name: 'window_declared'
      props: { via: 'form' | 'ics' | 'm365' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'; recurring: boolean }
    }
  | {
      name: 'run_started'
      props: { pack: 'sky' | 'crowd'; trigger: 'schedule' | 'crossing' | 'listing' | 'calendar' | 'request' }
    }
  | {
      name: 'bundle_drafted'
      props: { pack: 'sky' | 'crowd'; calls: number; non_normal: number; disagreements: number; no_call: boolean }
    }
  | {
      name: 'bundle_approved'
      props: {
        pack: 'sky' | 'crowd'
        minutes_to_approve: number
        edited: boolean
        rejected: boolean
        recheck_changed: boolean
      }
    }
  | { name: 'bundle_escalated'; props: { pack: 'sky' | 'crowd'; level: 'next_approver' | 'admins' } }
  | { name: 'approver_alerted'; props: { channel: 'web_push' | 'email'; seconds: number } }
  | { name: 'bundle_closed'; props: { pack: 'sky' | 'crowd'; reason: 'superseded' | 'expired' } }
  | {
      name: 'notice_sent'
      props: {
        channel: 'email' | 'ics' | 'webhook' | 'in_app'
        language: 'en' | 'ms'
        pack: 'sky' | 'crowd'
      }
    }
  | { name: 'unsubscribed'; props: { channel: 'email' | 'ics' | 'webhook' | 'in_app' } }
  | { name: 'evidence_requested'; props: { via: 'email' | 'app' | 'api' | 'mcp' } }
  | { name: 'evidence_replied'; props: { minutes: number; approval_needed: boolean } }
  | {
      name: 'call_graded'
      props: {
        pack: 'sky' | 'crowd'
        grade:
          | 'hit'
          | 'miss'
          | 'false_alarm'
          | 'correct_normal'
          | 'no_call'
          | 'in_band'
          | 'out_of_band'
          | 'unlisted_surge'
          | 'pending'
      }
    }
  | {
      name: 'clause_published'
      props: { pack: 'sky' | 'crowd'; clauses_changed: number; replay_calls_changed: number }
    }
  | { name: 'replay_run'; props: { pack: 'sky' | 'crowd'; days: number } }
  | { name: 'share_link_created'; props: { access: 'view' | 'reviewer'; expiry_days: number } }
  | {
      name: 'mcp_connected'
      props: { client: 'claude' | 'chatgpt' | 'gemini_cli' | 'gemini_enterprise' | 'cursor' | 'vscode' | 'other' }
    }
  | {
      name: 'mcp_tool_called'
      props: {
        tool:
          | 'list_projects'
          | 'get_signals'
          | 'list_bundles'
          | 'get_call'
          | 'explain_call'
          | 'get_clause_sheet'
          | 'replay_clauses'
          | 'get_ledger'
          | 'get_grades'
          | 'declare_window'
          | 'ask_for_call'
          | 'request_evidence'
        scope: 'read' | 'draft'
        ok: boolean
      }
    }
  | { name: 'api_key_created'; props: { scopes: Array<'read' | 'draft' | 'admin'>; expiry_days: number } }
  | { name: 'cli_login'; props: { os: 'macos' | 'linux' | 'windows' | 'unknown' } }
  | {
      name: 'embed_loaded'
      props: {
        component: 'skyclause-status' | 'skyclause-window'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
      }
    }
  | { name: 'export_requested'; props: { scope: 'account' | 'organisation' } }

test('matches all 30 PRD analytics event names', () => {
  expect(ANALYTICS_EVENT_TYPES).toEqual([
    'landing_window_set',
    'guest_started',
    'signed_up',
    'org_created',
    'project_created',
    'source_bound',
    'rota_set',
    'channel_connected',
    'onboarding_step',
    'window_declared',
    'run_started',
    'bundle_drafted',
    'bundle_approved',
    'bundle_escalated',
    'approver_alerted',
    'bundle_closed',
    'notice_sent',
    'unsubscribed',
    'evidence_requested',
    'evidence_replied',
    'call_graded',
    'clause_published',
    'replay_run',
    'share_link_created',
    'mcp_connected',
    'mcp_tool_called',
    'api_key_created',
    'cli_login',
    'embed_loaded',
    'export_requested'
  ])
  expect(ANALYTICS_EVENT_TYPES).toHaveLength(30)
})

test('types the PRD analytics properties and full POST /e body', () => {
  expectTypeOf<AnalyticsEvent>().toEqualTypeOf<ExpectedAnalyticsEvent>()
  expectTypeOf<AnalyticsBody>().toEqualTypeOf<AnalyticsEvent | VitalBody>()
})

test('keeps the plain TypeScript vital catalogue unchanged', () => {
  expect(VITAL_METRICS).toEqual(['LCP', 'INP', 'CLS', 'FCP', 'TTFB'])
  expect(ROUTE_GROUPS).toEqual(['marketing', 'public', 'auth', 'app', 'embed'])
  expectTypeOf<VitalBody>().toEqualTypeOf<{
    type: 'vital'
    metric: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
    value: number
    route_group: 'marketing' | 'public' | 'auth' | 'app' | 'embed'
  }>()
})
