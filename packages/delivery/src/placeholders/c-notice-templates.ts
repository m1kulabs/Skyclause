import { notBuilt, type CallView, type Problem, type TxHandle } from '@skyclause/contracts'

export interface Rendered {
  subject: string
  text: string
  html?: string
}

export type RenderNotice = (
  call: CallView,
  o: {
    language: string
    channel: 'email' | 'push' | 'ics'
    links: { permalink: string; unsubscribe?: string; preferences?: string; reply?: string }
  }
) => Rendered
export type CheckRequiredLines = (r: Rendered, call: CallView) => Problem[]
export type FindAttendanceExcuse = (text: string, lang: string) => string | null
export type MalayApprovalPolicy = (
  call: CallView,
  approver: { readsMalay: boolean }
) => { action: 'send' } | { action: 'fallback_en'; reason: 'malay-reader-required' }
export type RecipientsByLanguage = (tx: TxHandle, callId: string) => Promise<Record<'en' | 'ms', number>>

export const renderNotice: RenderNotice = notBuilt('c-notice-templates')
export const checkRequiredLines: CheckRequiredLines = notBuilt('c-notice-templates')
export const findAttendanceExcuse: FindAttendanceExcuse = notBuilt('c-notice-templates')
export const malayApprovalPolicy: MalayApprovalPolicy = notBuilt('c-notice-templates')
export const recipientsByLanguage: RecipientsByLanguage = notBuilt('c-notice-templates')
