export { webIdentityCredentials, type AwsCredentials, type WebIdentityOptions } from './aws-credentials'
export {
  createEmailTransport,
  EmailSendError,
  emailTransportFromEnv,
  requireEmailTransport,
  type EmailMessage,
  type EmailTransport,
  type EmailTransportOptions
} from './email'
export { googleLinkEmail, magicLinkDisabledEmail, magicLinkEmail } from './auth-emails'
export { isSnsUrl, SnsVerificationError, verifySnsMessage, type SnsMessage, type VerifyOptions } from './sns'
export {
  createInboundRouter,
  onInbound,
  sesInboundForAws,
  sesInboundHandler,
  type InboundBucket,
  type InboundHandler,
  type InboundMessage,
  type SesInboundOptions
} from './inbound'
export {
  checkRequiredLines,
  findAttendanceExcuse,
  malayApprovalPolicy,
  renderNotice,
  renderReplayPreview,
  REPLAY_2_NOVEMBER,
  type CheckRequiredLines,
  type FindAttendanceExcuse,
  type MalayApprovalPolicy,
  type NoticeContext,
  type NoticeLinks,
  type Rendered,
  type RenderNotice
} from './notices'
export { renderFeedbackEmail } from './feedback-email'
export { callNoticeEmail, type CallNoticeOptions } from './call-notice'
export { parseSesEvent, sesEventsHandler, type SesEvent, type SesEventsOptions } from './ses-events'
export { renderExportReadyEmail } from './export-ready-email'
export { renderSubscriberEmail, type SubscriberEmailKind } from './subscriber-emails'
export { ensureVapidKeys, type VapidKeysOptions } from './vapid'
export { renderApproverAlert, type ApproverAlert, type RenderedAlert } from './approver-alerts'
export { createPushTransport, encryptPushPayload, type PushTransportOptions } from './push'
export { writeCalendar, type IcsCalendar, type IcsEvent } from './ics'
