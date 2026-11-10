import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm'
import type { Tx } from '../client'
import { auditEvent, clientVerification, oauthOrgClient } from '../schema'

export const VERIFICATION_TARGETS = [
  'claude_ai',
  'claude_desktop',
  'claude_code',
  'chatgpt',
  'gemini_cli',
  'gemini_enterprise',
  'cursor',
  'vscode'
] as const

export type VerificationTarget = (typeof VERIFICATION_TARGETS)[number]
export type VerificationResult = 'pass' | 'fail'

export interface RecordVerificationInput {
  target: VerificationTarget
  clientVersion: string
  testedAt: Date
  result: VerificationResult
  testedBy: string
  notes?: string | null
}

const isAccountId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** The newest recorded live check for each client target. G is read through the caller's system or tenant tx. */
export async function latestVerifications(tx: Tx) {
  const rows = await tx
    .select()
    .from(clientVerification)
    .orderBy(desc(clientVerification.testedAt), desc(clientVerification.createdAt), desc(clientVerification.id))
  const latest = new Map<VerificationTarget, (typeof rows)[number]>()
  for (const row of rows) {
    if (VERIFICATION_TARGETS.includes(row.target) && !latest.has(row.target)) latest.set(row.target, row)
  }
  return [...latest.values()]
}

/** Record one human-run live check. The table is global and accepts writes only from the system login. */
export async function recordVerification(tx: Tx, input: RecordVerificationInput, now = new Date()) {
  if (!(VERIFICATION_TARGETS as readonly string[]).includes(input.target)) {
    throw new Error(`Unknown target: ${String(input.target)}`)
  }
  if (input.result !== 'pass' && input.result !== 'fail') throw new Error('Verification result must be pass or fail')
  if (!(input.testedAt instanceof Date) || !Number.isFinite(input.testedAt.getTime())) {
    throw new Error('Tested time must be a valid date')
  }
  if (input.testedAt.getTime() > now.getTime()) throw new Error('Tested time cannot be in the future')
  if (!input.clientVersion.trim()) throw new Error('Client version is required')
  if (!isAccountId(input.testedBy)) throw new Error('Recorder must be an account ID, not an email address')

  const [row] = await tx
    .insert(clientVerification)
    .values({
      target: input.target,
      clientVersion: input.clientVersion.trim(),
      testedAt: input.testedAt,
      result: input.result,
      testedBy: input.testedBy,
      notes: input.notes ?? null
    })
    .returning()
  if (!row) throw new Error('Verification record was not inserted')
  return row
}

/** The live, non-revoked client ID for this organisation; never selects a client secret. */
export async function oauthOrgClientId(tx: Tx): Promise<string | null> {
  const [client] = await tx
    .select({ clientId: oauthOrgClient.clientId })
    .from(oauthOrgClient)
    .where(isNull(oauthOrgClient.revokedAt))
    .orderBy(desc(oauthOrgClient.createdAt), desc(oauthOrgClient.id))
    .limit(1)
  return client?.clientId ?? null
}

/** The first matching tool-call audit event since the requested instant, scoped by tenant RLS and account ID. */
export async function firstMcpToolCall(tx: Tx, input: { accountId: string; since: Date }) {
  const [row] = await tx
    .select({ at: auditEvent.at, tool: auditEvent.targetId, clientName: auditEvent.clientName })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.actorType, 'account'),
        eq(auditEvent.actorId, input.accountId),
        eq(auditEvent.action, 'mcp.tool_called'),
        eq(auditEvent.targetType, 'mcp_tool'),
        gte(auditEvent.at, input.since)
      )
    )
    .orderBy(asc(auditEvent.at), asc(auditEvent.id))
    .limit(1)
  return row ?? null
}
