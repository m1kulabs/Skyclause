import type { Tx } from '../../src/client'
import { makeAiKey } from './ai_key'
import { makeAiUsage } from './ai_usage'
import { makeAnalysisMetric } from './analysis_metric'
import { makeAnalyticsEvent } from './analytics_event'
import { makeApproval } from './approval'
import { makeAuditEvent } from './audit_event'
import { makeBundle } from './bundle'
import { makeBundleAlert } from './bundle_alert'
import { makeCall } from './call'
import { makeClause } from './clause'
import { makeClauseSheet } from './clause_sheet'
import { makeComponentCheck } from './component_check'
import { makeConsentRecord } from './consent_record'
import { makeCrossing } from './crossing'
import { makeCrowdReply } from './crowd_reply'
import { makeDomainEvent } from './domain_event'
import { makeEventCounter } from './event_counter'
import { makeEvidenceRequest } from './evidence_request'
import { makeExportJob } from './export_job'
import { makeFeatureFlag } from './feature_flag'
import { makeForecast } from './forecast'
import { makeGrade } from './grade'
import { makeGuestBlock } from './guest_block'
import { makeGuestBudget } from './guest_budget'
import { makeGuestToken } from './guest_token'
import { makeHandledEvent } from './handled_event'
import { makeIdempotencyKey } from './idempotency_key'
import { makeIcsFeed } from './ics_feed'
import { makeIncident } from './incident'
import { makeIncidentUpdate } from './incident_update'
import { makeIndicatorSnapshot } from './indicator_snapshot'
import { makeLedgerEntry } from './ledger_entry'
import { makeListing } from './listing'
import { makeNight } from './night'
import { makeNotice } from './notice'
import { makeNotification } from './notification'
import { makeNotificationPreference } from './notification_preference'
import { makeOauthGrant } from './oauth_grant'
import { makeOauthOrgClient } from './oauth_org_client'
import { makeOwnershipTransfer } from './ownership_transfer'
import { makePilotArchive } from './pilot_archive'
import { makePlanFeedback } from './plan_feedback'
import { makePoll } from './poll'
import { makeProbationLabel } from './probation_label'
import { makeProbationResolution } from './probation_resolution'
import { makeProject } from './project'
import { makeProjectChannel } from './project_channel'
import { makeProjectPack } from './project_pack'
import { makeProjectSource } from './project_source'
import { makePushSubscription } from './push_subscription'
import { makeRateLimit } from './rate_limit'
import { makeReading } from './reading'
import { makeReplayResult } from './replay_result'
import { makeReviewItem } from './review_item'
import { makeRotaShift } from './rota_shift'
import { makeRun } from './run'
import { makeRunStep } from './run_step'
import { makeShadowState } from './shadow_state'
import { makeShareLink } from './share_link'
import { makeSheetVersion } from './sheet_version'
import { makeShiftReminder } from './shift_reminder'
import { makeSource } from './source'
import { makeSourceState } from './source_state'
import { makeSubscribeLink } from './subscribe_link'
import { makeSubscriber } from './subscriber'
import { makeSubscriberToken } from './subscriber_token'
import { makeSuppression } from './suppression'
import { makeVerification } from './verification'
import { makeWebhook } from './webhook'
import { makeWebhookDelivery } from './webhook_delivery'
import { makeWebhookDispatch } from './webhook_dispatch'
import { makeWindow } from './window'
import { makeWindowReport } from './window_report'
import { makeWindowSeries } from './window_series'

export { makeAiKey } from './ai_key'
export { makeAiUsage } from './ai_usage'
export { makeAnalysisMetric } from './analysis_metric'
export { makeAnalyticsEvent } from './analytics_event'
export { makeApproval } from './approval'
export { makeAuditEvent } from './audit_event'
export { makeBundle } from './bundle'
export { makeBundleAlert } from './bundle_alert'
export { makeCall } from './call'
export { makeClause } from './clause'
export { makeClauseSheet } from './clause_sheet'
export { makeComponentCheck } from './component_check'
export { makeConsentRecord } from './consent_record'
export { makeCrossing } from './crossing'
export { makeCrowdReply } from './crowd_reply'
export { makeDomainEvent } from './domain_event'
export { makeEventCounter } from './event_counter'
export { makeEvidenceRequest } from './evidence_request'
export { makeExportJob } from './export_job'
export { makeFeatureFlag } from './feature_flag'
export { makeForecast } from './forecast'
export { makeGrade } from './grade'
export { makeGuestBlock } from './guest_block'
export { makeGuestBudget } from './guest_budget'
export { makeGuestToken } from './guest_token'
export { makeHandledEvent } from './handled_event'
export { makeIcsFeed } from './ics_feed'
export { makeIncident } from './incident'
export { makeIncidentUpdate } from './incident_update'
export { makeIndicatorSnapshot } from './indicator_snapshot'
export { makeLedgerEntry } from './ledger_entry'
export { makeListing } from './listing'
export { makeMember } from './member'
export { makeNight } from './night'
export { makeNotice } from './notice'
export { makeNotification } from './notification'
export { makeNotificationPreference } from './notification_preference'
export { makeOauthGrant } from './oauth_grant'
export { makeOauthOrgClient } from './oauth_org_client'
export { makeOrganization } from './organization'
export { makeOwnershipTransfer } from './ownership_transfer'
export { makePilotArchive } from './pilot_archive'
export { makePlanFeedback } from './plan_feedback'
export { makePoll } from './poll'
export { makeProbationLabel } from './probation_label'
export { makeProbationResolution } from './probation_resolution'
export { makeProject } from './project'
export { makeProjectChannel } from './project_channel'
export { makeProjectPack } from './project_pack'
export { makeProjectSource } from './project_source'
export { makePushSubscription } from './push_subscription'
export { makeReading } from './reading'
export { makeReplayResult } from './replay_result'
export { makeReviewItem } from './review_item'
export { makeRotaShift } from './rota_shift'
export { makeRun } from './run'
export { makeRunStep } from './run_step'
export { makeShadowState } from './shadow_state'
export { makeShareLink } from './share_link'
export { makeSheetVersion } from './sheet_version'
export { makeShiftReminder } from './shift_reminder'
export { makeSource } from './source'
export { makeSourceState } from './source_state'
export { makeSubscribeLink } from './subscribe_link'
export { makeSubscriber } from './subscriber'
export { makeSubscriberToken } from './subscriber_token'
export { makeSuppression } from './suppression'
export { makeUser } from './user'
export { makeVerification } from './verification'
export { makeWebhook } from './webhook'
export { makeWebhookDelivery } from './webhook_delivery'
export { makeWebhookDispatch } from './webhook_dispatch'
export { makeWindow } from './window'
export { makeWindowReport } from './window_report'
export { makeWindowSeries } from './window_series'
export { nextSeq, rowOf, sheetVersionIn } from './rows'

/**
 * One row of each T table (`org_id NOT NULL`) in the transaction's organisation, keyed by table name. The
 * cross-organisation test reads the live schema and fails on a T table missing here, so a new T table joins it.
 */
export const tenantFactories: Record<string, (tx: Tx) => Promise<unknown>> = {
  ai_key: makeAiKey,
  ai_usage: makeAiUsage,
  analysis_metric: makeAnalysisMetric,
  approval: makeApproval,
  audit_event: makeAuditEvent,
  bundle: makeBundle,
  bundle_alert: makeBundleAlert,
  call: makeCall,
  clause: makeClause,
  clause_sheet: makeClauseSheet,
  consent_record: makeConsentRecord,
  crossing: makeCrossing,
  crowd_reply: makeCrowdReply,
  domain_event: makeDomainEvent,
  evidence_request: makeEvidenceRequest,
  forecast: makeForecast,
  grade: makeGrade,
  guest_token: makeGuestToken,
  ics_feed: makeIcsFeed,
  indicator_snapshot: makeIndicatorSnapshot,
  ledger_entry: makeLedgerEntry,
  listing: makeListing,
  night: makeNight,
  notice: makeNotice,
  notification: makeNotification,
  notification_preference: makeNotificationPreference,
  oauth_grant: makeOauthGrant,
  oauth_org_client: makeOauthOrgClient,
  ownership_transfer: makeOwnershipTransfer,
  pilot_archive: makePilotArchive,
  plan_feedback: makePlanFeedback,
  probation_label: makeProbationLabel,
  probation_resolution: makeProbationResolution,
  project: makeProject,
  project_channel: makeProjectChannel,
  project_pack: makeProjectPack,
  project_source: makeProjectSource,
  push_subscription: makePushSubscription,
  replay_result: makeReplayResult,
  review_item: makeReviewItem,
  rota_shift: makeRotaShift,
  run: makeRun,
  run_step: makeRunStep,
  shadow_state: makeShadowState,
  share_link: makeShareLink,
  sheet_version: makeSheetVersion,
  shift_reminder: makeShiftReminder,
  subscribe_link: makeSubscribeLink,
  subscriber: makeSubscriber,
  subscriber_token: makeSubscriberToken,
  suppression: makeSuppression,
  webhook: makeWebhook,
  webhook_delivery: makeWebhookDelivery,
  webhook_dispatch: makeWebhookDispatch,
  window: makeWindow,
  window_report: makeWindowReport,
  window_series: makeWindowSeries
}

/**
 * One row of each C, G and S table, made under `withTenant` with a system principal: a device source (and its polls,
 * readings and state) of that organisation, a global row, a system row. With `tenantFactories` it covers every table
 * in `public`; `factories.test.ts` fails on one missing from both.
 */
export const sharedFactories: Record<string, (tx: Tx) => Promise<unknown>> = {
  analytics_event: makeAnalyticsEvent,
  component_check: makeComponentCheck,
  event_counter: makeEventCounter,
  export_job: makeExportJob,
  feature_flag: makeFeatureFlag,
  guest_block: makeGuestBlock,
  guest_budget: makeGuestBudget,
  handled_event: makeHandledEvent,
  idempotency_key: makeIdempotencyKey,
  incident: makeIncident,
  incident_update: makeIncidentUpdate,
  poll: makePoll,
  rate_limit: makeRateLimit,
  reading: makeReading,
  source: makeSource,
  source_state: makeSourceState,
  verification: makeVerification
}
