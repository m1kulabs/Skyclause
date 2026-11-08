export interface ControlledMail {
  to: string
  subject: string
  body: string
}
export interface ControlledDraft extends ControlledMail {
  id: string
  messageId: string
  threadId: string
}
export interface ControlledSent extends ControlledMail {
  id: string
  threadId: string
}
export interface DraftAttemptState {
  recipient?: string
  draftCreationAttempted?: boolean
  draftId?: string
  threadId?: string
  gmailMessageId?: string
}
export interface ControlledDraftPorts {
  saveAttempt(next: DraftAttemptState): void
  createDraft(mail: ControlledMail): { id: string }
  draft(id: string): ControlledDraft | null
  sendDraft(id: string): { id: string; threadId?: string }
  // Must scan the complete provider result set, or throw. Never return a partial search as complete.
  findSent(marker: string): ControlledSent[]
}
export type ControlledDraftResult =
  | { status: 'sent' | 'reconciled'; gmailMessageId: string; attempt: DraftAttemptState }
  | { status: 'pending'; code: string }

function matches(message: ControlledMail, expected: ControlledMail): boolean {
  return (
    message.to.toLowerCase() === expected.to.toLowerCase() &&
    message.subject === expected.subject &&
    message.body === expected.body
  )
}

export function deliverControlledDraft(
  attempt: DraftAttemptState,
  marker: string,
  mail: ControlledMail,
  ports: ControlledDraftPorts
): ControlledDraftResult {
  let current = { ...attempt }
  let stage = 'intent_save_failed'
  const pending = (code: string): ControlledDraftResult => ({ status: 'pending', code })
  const save = (next: DraftAttemptState) => {
    stage = 'intent_save_failed'
    ports.saveAttempt({ ...next })
    current = next
  }
  try {
    let outcome: 'sent' | 'reconciled' = 'reconciled'
    if (!current.gmailMessageId) {
      let draft: ControlledDraft | null = null
      if (current.draftCreationAttempted || current.draftId) {
        stage = 'sent_search_failed'
        const candidates = ports.findSent(marker)
        const verified = new Map(
          candidates
            .filter((candidate) => candidate.id && matches(candidate, mail))
            .map((candidate) => [candidate.id, candidate])
        )
        if (verified.size > 1) return pending('sent_ambiguous')
        const found = verified.values().next().value as ControlledSent | undefined
        if (found) {
          save({ ...current, gmailMessageId: found.id, threadId: found.threadId })
        } else {
          stage = 'draft_read_failed'
          draft = current.draftId ? ports.draft(current.draftId) : null
          if (!draft) return pending('draft_missing_no_sent_match')
          if (draft.id !== current.draftId || !matches(draft, mail)) return pending('draft_mismatch')
        }
      } else {
        // A lost create response is ambiguous too: freeze recipient and attempt in one save first.
        save({ ...current, recipient: mail.to, draftCreationAttempted: true })
        stage = 'draft_create_failed'
        const created = ports.createDraft(mail)
        if (typeof created.id !== 'string' || !created.id.trim()) return pending('draft_mismatch')
        save({ ...current, draftId: created.id })
        stage = 'draft_read_failed'
        draft = ports.draft(created.id)
        if (!draft || draft.id !== created.id || !draft.messageId || !matches(draft, mail))
          return pending('draft_mismatch')
        save({ ...current, threadId: draft.threadId })
      }
      if (draft && !current.gmailMessageId) {
        stage = 'send_ambiguous'
        const sent = ports.sendDraft(draft.id)
        if (typeof sent.id !== 'string' || !sent.id.trim()) return pending('sent_response_invalid')
        save({ ...current, gmailMessageId: sent.id, threadId: sent.threadId ?? current.threadId })
        outcome = 'sent'
      }
    }
    if (!current.gmailMessageId) return pending('provider_id_missing')
    return { status: outcome, gmailMessageId: current.gmailMessageId, attempt: current }
  } catch {
    return pending(stage)
  }
}
