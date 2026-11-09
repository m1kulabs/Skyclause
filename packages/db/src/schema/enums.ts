import { pgEnum } from 'drizzle-orm/pg-core'

// Value sets #79 §1 and §3 list. Sets §3 leaves open (statuses its owner defines) are text columns instead.

export const sourceKind = pgEnum('source_kind', [
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
])
export const sourceRole = pgEnum('source_role', [
  'rain_gauge',
  'api_station',
  'warnings',
  'met_forecast',
  'rail_station',
  'venue_listings',
  'bus_feed',
  'gtfs_static',
  'camera',
  'pi'
])
export const freshness = pgEnum('freshness', ['observed', 'polled'])
export const inputState = pgEnum('input_state', [
  'fresh',
  'stale',
  'error',
  'recovered',
  'pending',
  'probation',
  'off_hours'
])
export const mode = pgEnum('mode', [
  'normal',
  'outdoor_limited',
  'commute_disruption',
  'hybrid_recommended',
  'surge_night'
])
export const scopeKind = pgEnum('scope_kind', ['site', 'window', 'night'])
export const sheetStatus = pgEnum('sheet_status', ['draft', 'published'])
export const windowKind = pgEnum('window_kind', ['class', 'event', 'commute_wave'])
export const windowVia = pgEnum('window_via', ['app', 'form', 'ics', 'api', 'cli', 'mcp', 'guest', 'share'])
export const moderation = pgEnum('moderation', ['visible', 'hidden_pending_review', 'removed'])
export const shareAccess = pgEnum('share_access', ['view', 'reviewer'])
export const listingState = pgEnum('listing_state', ['proposed', 'listed', 'rejected', 'cancelled'])
export const nightState = pgEnum('night_state', ['upcoming', 'in_progress', 'awaiting_actuals', 'graded', 'unlisted'])
export const runTrigger = pgEnum('run_trigger', ['schedule', 'crossing', 'window', 'listing', 'calendar', 'request'])
export const runStatus = pgEnum('run_status', ['queued', 'running', 'drafted', 'no_draft', 'failed'])
export const bundleState = pgEnum('bundle_state', [
  'drafted',
  'closed',
  'needs_review',
  'superseded',
  'expired',
  'reconfirm',
  'approved',
  'sending',
  'sent',
  'graded'
])
export const callState = pgEnum('call_state', [
  'drafted',
  'approved',
  'edited',
  'rejected',
  'expired',
  'superseded',
  'sending',
  'sent',
  'failed'
])
export const approvalAction = pgEnum('approval_action', [
  'approve',
  'edit',
  'reject',
  'reconfirm',
  'choose_verdict',
  'escalate',
  'list',
  'reject_listing',
  'approve_change',
  'approve_cancel',
  'approve_reply'
])
export const noticeKind = pgEnum('notice_kind', [
  'call',
  'approver_alert',
  'confirmation',
  'preference_link',
  'feedback',
  'evidence_reply',
  'webhook_disabled',
  'export_ready'
])
export const noticeChannel = pgEnum('notice_channel', ['email', 'push'])
export const noticeStatus = pgEnum('notice_status', [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'suppressed',
  'failed',
  'expired'
])
export const subscriberTokenPurpose = pgEnum('subscriber_token_purpose', [
  'confirm',
  'manage',
  'unsubscribe',
  'reply',
  'feedback'
])
export const suppressionReason = pgEnum('suppression_reason', ['bounce', 'complaint', 'unsubscribe'])
// c-subscribers: how a consent record arose (NTC-8, NTC-13, NTC-14).
export const consentForm = pgEnum('consent_form', ['subscribe_link', 'import', 'confirm', 'preferences'])
export const crowdReplyKind = pgEnum('crowd_reply_kind', ['keep', 'shift', 'shuttle'])
export const evidenceVia = pgEnum('evidence_via', ['email', 'app', 'api', 'mcp'])
export const replyChannel = pgEnum('reply_channel', ['email', 'in_app'])
export const evidenceRequesterKind = pgEnum('evidence_requester_kind', ['member', 'guest', 'share_link', 'subscriber'])
export const projectChannelKind = pgEnum('project_channel_kind', ['email', 'ics', 'webhook', 'in_app'])
export const notificationKind = pgEnum('notification_kind', [
  'needs_review',
  'escalated',
  'source_error',
  'review_item',
  'auditor'
])
export const rotaTemplate = pgEnum('rota_template', ['storm_afternoon', 'surge_night', 'custom'])
export const alertChannel = pgEnum('alert_channel', ['web_push', 'email'])
export const alertLevel = pgEnum('alert_level', ['on_duty', 'next_approver', 'admins'])
export const gradeOutcome = pgEnum('grade_outcome', [
  'hit',
  'miss',
  'false_alarm',
  'correct_normal',
  'no_call',
  'in_band',
  'out_of_band',
  'unlisted_surge',
  'pending'
])
export const keyOwner = pgEnum('key_owner', ['organisation', 'account'])
export const exportScope = pgEnum('export_scope', ['account', 'organisation'])
export const verificationTarget = pgEnum('verification_target', [
  'claude_ai',
  'claude_desktop',
  'claude_code',
  'chatgpt',
  'gemini_cli',
  'gemini_enterprise',
  'cursor',
  'vscode'
])
export const guestSubjectKind = pgEnum('guest_subject_kind', ['device', 'ip', 'share_link', 'commons'])
export const incidentScope = pgEnum('incident_scope', ['ours', 'source'])
export const pilotArchiveKind = pgEnum('pilot_archive_kind', ['sheets_ledger', 'jira_register', 'run_traces'])
/** `audit_event.actor_type`, one per `Principal` kind (TRD: account, API key, OAuth client, system). */
export const auditActor = pgEnum('audit_actor', [
  'account',
  'api_key',
  'oauth_client',
  'guest_token',
  'share_link',
  'device',
  'system'
])
/** `Principal['client']` (#79 §1). */
export const principalClient = pgEnum('principal_client', ['app', 'api', 'cli', 'mcp', 'playground', 'worker'])
