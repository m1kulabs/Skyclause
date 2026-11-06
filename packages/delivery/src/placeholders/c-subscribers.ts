import { notBuilt, type EmailHash, type IssueSubscriberToken, type VerifySubscriberToken } from '@skyclause/contracts'

export const issueSubscriberToken: IssueSubscriberToken = notBuilt('c-subscribers')
export const verifySubscriberToken: VerifySubscriberToken = notBuilt('c-subscribers')
export const emailHash: EmailHash = notBuilt('c-subscribers')
