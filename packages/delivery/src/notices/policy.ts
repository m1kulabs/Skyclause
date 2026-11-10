import type { CallView } from '@skyclause/contracts'

export type MalayApprovalPolicy = (
  call: CallView,
  approver: { readsMalay: boolean }
) => { action: 'send' } | { action: 'fallback_en'; reason: 'malay-reader-required' }

/**
 * LOC-5: a model-written Malay notice (an `ms` entry in the call's `notices`) needs a Malay-reading approver;
 * otherwise the call goes in English. Template Malay, with no model wording in Malay, needs no reader.
 */
export const malayApprovalPolicy: MalayApprovalPolicy = (call, approver) =>
  call.notices.some((n) => n.language === 'ms') && !approver.readsMalay
    ? { action: 'fallback_en', reason: 'malay-reader-required' }
    : { action: 'send' }
