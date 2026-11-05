export { webIdentityCredentials, type AwsCredentials, type WebIdentityOptions } from './aws-credentials'
export {
  createEmailTransport,
  SesError,
  type EmailMessage,
  type EmailTransport,
  type EmailTransportOptions,
  type SesClient
} from './email'
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
