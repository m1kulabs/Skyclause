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

// PRD "Analytics events" and Spec §2. Event names and properties stay free of personal data.
export const ANALYTICS_EVENT_TYPES = [
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
] as const

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

export const ANALYTICS_MODES = [
  'normal',
  'outdoor_limited',
  'commute_disruption',
  'hybrid_recommended',
  'surge_night'
] as const
export type AnalyticsMode = (typeof ANALYTICS_MODES)[number]

export const ANALYTICS_PACKS = ['sky', 'crowd'] as const
export type AnalyticsPack = (typeof ANALYTICS_PACKS)[number]

// Spec §1 organization plan and source-kind catalogues.
export const ANALYTICS_PLANS = ['community', 'team', 'campus', 'commons'] as const
export type AnalyticsPlan = (typeof ANALYTICS_PLANS)[number]

export const ANALYTICS_ADAPTERS = [
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
] as const
export type AnalyticsAdapter = (typeof ANALYTICS_ADAPTERS)[number]

export const ANALYTICS_CHANNELS = ['email', 'ics', 'webhook', 'in_app'] as const
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number]

export const ANALYTICS_WINDOW_SOURCES = ['form', 'ics', 'm365', 'api', 'cli', 'mcp', 'guest', 'share'] as const
export type AnalyticsWindowSource = (typeof ANALYTICS_WINDOW_SOURCES)[number]

export const ANALYTICS_TRIGGERS = ['schedule', 'crossing', 'listing', 'calendar', 'request'] as const
export type AnalyticsTrigger = (typeof ANALYTICS_TRIGGERS)[number]

export const ANALYTICS_GRADES = [
  'hit',
  'miss',
  'false_alarm',
  'correct_normal',
  'no_call',
  'in_band',
  'out_of_band',
  'unlisted_surge',
  'pending'
] as const
export type AnalyticsGrade = (typeof ANALYTICS_GRADES)[number]

export const ANALYTICS_MCP_CLIENTS = [
  'claude',
  'chatgpt',
  'gemini_cli',
  'gemini_enterprise',
  'cursor',
  'vscode',
  'other'
] as const
export type AnalyticsMcpClient = (typeof ANALYTICS_MCP_CLIENTS)[number]

export const ANALYTICS_MCP_TOOLS = [
  'list_projects',
  'get_signals',
  'list_bundles',
  'get_call',
  'explain_call',
  'get_clause_sheet',
  'replay_clauses',
  'get_ledger',
  'get_grades',
  'declare_window',
  'ask_for_call',
  'request_evidence'
] as const
export type AnalyticsMcpTool = (typeof ANALYTICS_MCP_TOOLS)[number]

export const ANALYTICS_MCP_SCOPES = ['read', 'draft'] as const
export type AnalyticsMcpScope = (typeof ANALYTICS_MCP_SCOPES)[number]

export const ANALYTICS_API_KEY_SCOPES = ['read', 'draft', 'admin'] as const
export type AnalyticsApiKeyScope = (typeof ANALYTICS_API_KEY_SCOPES)[number]

export const ANALYTICS_ONBOARDING_STEPS = [
  'org_created',
  'project_created',
  'source_bound',
  'window_declared',
  'rota_set',
  'channel_connected'
] as const
export type AnalyticsOnboardingStep = (typeof ANALYTICS_ONBOARDING_STEPS)[number]

export const ANALYTICS_LANGUAGES = ['en', 'ms'] as const
export type AnalyticsLanguage = (typeof ANALYTICS_LANGUAGES)[number]

export const ANALYTICS_ROUTE_SCOPES = ['account', 'organisation'] as const
export type AnalyticsRouteScope = (typeof ANALYTICS_ROUTE_SCOPES)[number]

export const ANALYTICS_EMBED_COMPONENTS = ['skyclause-status', 'skyclause-window'] as const
export type AnalyticsEmbedComponent = (typeof ANALYTICS_EMBED_COMPONENTS)[number]

export const ANALYTICS_OPERATING_SYSTEMS = ['macos', 'linux', 'windows'] as const
export type AnalyticsOperatingSystem = (typeof ANALYTICS_OPERATING_SYSTEMS)[number]

export type AnalyticsEvent =
  | {
      name: 'landing_window_set'
      props: { modes: AnalyticsMode[]; inputs_fresh: number; inputs_error: number }
    }
  | { name: 'guest_started'; props: { bot_check: 'passed' | 'failed' } }
  | {
      name: 'signed_up'
      props: { method: 'magic_link' | 'google' | 'passkey'; from_guest: boolean }
    }
  | { name: 'org_created'; props: { plan: AnalyticsPlan } }
  | { name: 'project_created'; props: { packs: AnalyticsPack[] } }
  | { name: 'source_bound'; props: { adapter: AnalyticsAdapter; cadence_min: number } }
  | { name: 'rota_set'; props: { shifts: number; conditional: boolean } }
  | { name: 'channel_connected'; props: { channel: AnalyticsChannel } }
  | { name: 'onboarding_step'; props: { step: AnalyticsOnboardingStep; skipped: boolean } }
  | { name: 'window_declared'; props: { via: AnalyticsWindowSource; recurring: boolean } }
  | { name: 'run_started'; props: { pack: AnalyticsPack; trigger: AnalyticsTrigger } }
  | {
      name: 'bundle_drafted'
      props: {
        pack: AnalyticsPack
        calls: number
        non_normal: number
        disagreements: number
        no_call: boolean
      }
    }
  | {
      name: 'bundle_approved'
      props: {
        pack: AnalyticsPack
        minutes_to_approve: number
        edited: boolean
        rejected: boolean
        recheck_changed: boolean
      }
    }
  | { name: 'bundle_escalated'; props: { pack: AnalyticsPack; level: 'next_approver' | 'admins' } }
  | { name: 'approver_alerted'; props: { channel: 'web_push' | 'email'; seconds: number } }
  | { name: 'bundle_closed'; props: { pack: AnalyticsPack; reason: 'superseded' | 'expired' } }
  | {
      name: 'notice_sent'
      props: { channel: AnalyticsChannel; language: AnalyticsLanguage; pack: AnalyticsPack }
    }
  | { name: 'unsubscribed'; props: { channel: AnalyticsChannel } }
  | { name: 'evidence_requested'; props: { via: 'email' | 'app' | 'api' | 'mcp' } }
  | { name: 'evidence_replied'; props: { minutes: number; approval_needed: boolean } }
  | { name: 'call_graded'; props: { pack: AnalyticsPack; grade: AnalyticsGrade } }
  | {
      name: 'clause_published'
      props: { pack: AnalyticsPack; clauses_changed: number; replay_calls_changed: number }
    }
  | { name: 'replay_run'; props: { pack: AnalyticsPack; days: number } }
  | { name: 'share_link_created'; props: { access: 'view' | 'reviewer'; expiry_days: number } }
  | { name: 'mcp_connected'; props: { client: AnalyticsMcpClient } }
  | {
      name: 'mcp_tool_called'
      props: { tool: AnalyticsMcpTool; scope: AnalyticsMcpScope; ok: boolean }
    }
  | { name: 'api_key_created'; props: { scopes: AnalyticsApiKeyScope[]; expiry_days: number } }
  | { name: 'cli_login'; props: { os: AnalyticsOperatingSystem } }
  | { name: 'embed_loaded'; props: { component: AnalyticsEmbedComponent; mode: AnalyticsMode } }
  | { name: 'export_requested'; props: { scope: AnalyticsRouteScope } }

// Spec §2 stores each event as a name plus props; vital beacons retain their existing body.
export type AnalyticsBody = AnalyticsEvent | VitalBody
