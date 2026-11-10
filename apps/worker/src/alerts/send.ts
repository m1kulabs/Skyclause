import type { EmailTransport, PushTransport, ShiftConditions, TxHandle } from '@skyclause/contracts'
import {
  accountEmails,
  alertNotices,
  bundleForAlert,
  insertBundleAlert,
  orgSlug,
  parseAlertKey,
  projectForAlert,
  pushTargets,
  queueAlerts,
  run,
  settleNotice,
  settlePushSubscriptions,
  shadowModes,
  systemPrincipal,
  track,
  withTenant,
  type AlertChannel,
  type AlertSubject,
  type Tx
} from '@skyclause/db'
import { renderApproverAlert, SesError, type ApproverAlert, type RenderedAlert } from '@skyclause/delivery'
import { eq } from 'drizzle-orm'
import type { ScheduleTask } from '../bundles/cloud-tasks'
import { log } from '../server'

// #155: how an approver alert leaves. The caller's transaction queues `notice` rows and `prepare`s them (reads and
// renders); after it commits, `post` calls the push service and SES with no transaction open, and `record` writes what
// they answered: the notice's status, `bundle_alert` rows (CAL-10), gone subscriptions and `approver_alerted`.

/** #103's rota lookups (names only in #79 §1): account IDs, Approver or above. */
export type OnDuty = (tx: TxHandle, q: { projectId: string; at: Date }) => Promise<string[]>
export type NextApprovers = (tx: TxHandle, q: { projectId: string; at: Date }) => Promise<string[]>

export interface AlertsDeps {
  /** Null while a VAPID value is unset (#113): no push notice is written then. */
  push: () => PushTransport | null
  email: () => EmailTransport
  schedule: ScheduleTask
  onDuty: OnDuty
  nextApprovers: NextApprovers
  conditions: ShiftConditions
  /** `APP_ORIGIN`, where every alert's link opens. */
  appOrigin: () => string
  now: () => Date
}

export const ALERTS_JOB = 'approver-alerts'

export function inOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>) {
  return withTenant({ orgId, principal: systemPrincipal(ALERTS_JOB) }, fn)
}

export interface Target {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** One message ready to post, or a notice that no longer applies (`expired`) or can't reach anyone (`failed`). */
export interface Outgoing {
  noticeId?: string
  /** Null for an organisation-rota reminder. */
  projectId: string | null
  subject: AlertSubject | null
  channel: AlertChannel
  accountId: string
  needsReviewAt: Date | null
  settle?: 'expired' | 'failed'
  push?: { targets: Target[]; payload: { title: string; body: string; url: string; tag: string }; ttlS: number }
  email?: { to: string; subject: string; text: string; idempotencyKey: string }
}

export interface Answer {
  out: Outgoing
  /** `queued`: nothing accepted it and a later attempt may; the resend sweep tries again. */
  status: 'sent' | 'failed' | 'expired' | 'queued'
  providerMessageId?: string
  acceptedAt?: Date
  gone: string[]
  ok: string[]
}

/** Each account's channels: email always, push when push is on and the account has a device here. */
export async function channelsFor(tx: Tx, deps: AlertsDeps, accountIds: string[]) {
  const unique = [...new Set(accountIds)]
  const withDevice = deps.push() ? new Set((await pushTargets(tx, unique)).map((t) => t.accountId)) : new Set()
  return unique.flatMap((accountId) => [
    ...(withDevice.has(accountId) ? [{ accountId, channel: 'push' as const }] : []),
    { accountId, channel: 'email' as const }
  ])
}

/** The message for one rendered alert on one channel. */
export async function compose(
  tx: Tx,
  o: Omit<Outgoing, 'push' | 'email' | 'settle'> & {
    key: string
    rendered: RenderedAlert
    url: string
    tag: string
    ttlS: number
  }
): Promise<Outgoing> {
  const base = {
    noticeId: o.noticeId,
    projectId: o.projectId,
    subject: o.subject,
    channel: o.channel,
    accountId: o.accountId,
    needsReviewAt: o.needsReviewAt
  }
  if (o.channel === 'push') {
    const targets = (await pushTargets(tx, [o.accountId])).map(({ accountId: _, ...target }) => target)
    if (!targets.length) return { ...base, settle: 'failed' }
    const payload = { title: o.rendered.title, body: o.rendered.body, url: o.url, tag: o.tag }
    return { ...base, push: { targets, payload, ttlS: Math.max(60, Math.ceil(o.ttlS)) } }
  }
  const to = (await accountEmails(tx, [o.accountId])).get(o.accountId)
  if (!to) return { ...base, settle: 'failed' }
  return { ...base, email: { to, subject: o.rendered.title, text: o.rendered.text, idempotencyKey: o.key } }
}

/** Queues an alert for each account on its channels, then prepares every notice of it still queued. */
export async function queueAndPrepare(
  tx: Tx,
  deps: AlertsDeps,
  o: { projectId: string; subject: AlertSubject; accountIds: string[] }
): Promise<Outgoing[]> {
  const ids = await queueAlerts(tx, o.projectId, o.subject, await channelsFor(tx, deps, o.accountIds))
  return prepare(tx, deps, ids)
}

/** Reads and renders queued `approver_alert` notices; an alert whose bundle left Needs review is `expired`. */
export async function prepare(tx: Tx, deps: AlertsDeps, noticeIds: string[]): Promise<Outgoing[]> {
  if (!noticeIds.length) return []
  const now = deps.now()
  const origin = deps.appOrigin()
  const org = await orgSlug(tx)
  const out: Outgoing[] = []
  for (const n of await alertNotices(tx, noticeIds)) {
    const subject = parseAlertKey(n.key)
    const base = { noticeId: n.id, projectId: n.projectId, subject, channel: n.channel, accountId: n.accountId! }
    const expired = () => out.push({ ...base, needsReviewAt: null, settle: 'expired' })
    if (n.projectId === null) throw new Error(`approver alert notice ${n.id} is missing project_id`)
    if (subject?.kind === 'alert') {
      const found = await bundleForAlert(tx, subject.bundleId)
      if (!found || found.bundle.state !== 'needs_review' || !found.bundle.slaDueAt) {
        expired()
        continue
      }
      const { bundle, project, calls } = found
      const slaDueAt = bundle.slaDueAt!
      const needsReviewAt = bundle.needsReviewAt ?? slaDueAt
      const lead = calls.find((c) => c.mode && c.mode !== 'normal') ?? calls[0]
      const alert: ApproverAlert = {
        kind: subject.level === 'on_duty' ? 'needs_review' : 'escalated',
        project: project.name,
        pack: bundle.pack,
        calls: calls.length,
        mode: lead?.mode ?? null,
        window: lead?.startsAt && lead.endsAt ? { startsAt: lead.startsAt, endsAt: lead.endsAt } : null,
        slaDueAt,
        input: firstFiredInput(lead?.shadow),
        url: `${origin}/${org}/${project.slug}/bundles/${bundle.id}`,
        now
      }
      const slaMs = slaDueAt.getTime() - needsReviewAt.getTime()
      out.push(
        await compose(tx, {
          ...base,
          key: n.key,
          needsReviewAt,
          rendered: renderApproverAlert(alert),
          url: alert.url,
          tag: bundle.id,
          // On duty: what is left of the SLA; an escalation: one SLA.
          ttlS: (subject.level === 'on_duty' ? slaDueAt.getTime() - now.getTime() : slaMs) / 1000
        })
      )
    } else if (subject?.kind === 'no_draft') {
      const [failed] = await tx.select().from(run).where(eq(run.id, subject.runId))
      const project = await projectForAlert(tx, n.projectId)
      if (!failed || !project) {
        expired()
        continue
      }
      const url = `${origin}/${org}/${project.slug}/bundles`
      const rendered = renderApproverAlert({
        kind: 'no_draft',
        project: project.name,
        pack: failed.pack,
        reason: failed.reason ?? failed.status,
        modes: await shadowModes(tx, project.id, failed.pack),
        url
      })
      out.push(
        await compose(tx, {
          ...base,
          key: n.key,
          needsReviewAt: null,
          rendered,
          url,
          tag: `run-${failed.id}`,
          ttlS: 3600
        })
      )
    } else {
      expired()
    }
  }
  return out
}

/** `{input} {value}, {age} old` comes from the first fired clause's first input in the call's shadow verdict. */
function firstFiredInput(shadow: unknown): Extract<ApproverAlert, { kind: 'needs_review' | 'escalated' }>['input'] {
  const clauses = (shadow as { clauses?: Array<{ result?: string; inputs?: unknown[] }> } | null)?.clauses ?? []
  const input = clauses.find((c) => c.result === 'fired')?.inputs?.[0] as
    { name?: string; value?: unknown; unit?: string; ageS?: number | null } | undefined
  if (!input?.name || input.value === undefined || input.value === null) return null
  return { name: input.name, value: input.value, unit: input.unit ?? '', ageS: input.ageS ?? null }
}

/** A 4xx from SES other than throttling (a D48 sandbox rejection, say) will fail again: the notice ends `failed`. */
const permanent = (error: unknown) =>
  error instanceof SesError &&
  error.status !== null &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 429

/** Calls the push service and SES; no transaction is open. */
export async function post(deps: AlertsDeps, outgoing: Outgoing[]): Promise<Answer[]> {
  const answers: Answer[] = []
  for (const out of outgoing) {
    const answer: Answer = { out, status: out.settle ?? 'queued', gone: [], ok: [] }
    answers.push(answer)
    if (out.push) {
      const push = deps.push()
      if (!push) continue
      let transient = false
      for (const target of out.push.targets) {
        try {
          const { status } = await push.send(target, out.push.payload, { ttlS: out.push.ttlS })
          if (status >= 200 && status < 300) {
            answer.ok.push(target.id)
            answer.acceptedAt ??= deps.now()
          } else if (status === 404 || status === 410) answer.gone.push(target.id)
          else {
            transient = true
            log('ERROR', 'approver push refused', { notice_id: out.noticeId, subscription_id: target.id, status })
          }
        } catch (error) {
          transient = true
          log('ERROR', 'approver push failed', {
            notice_id: out.noticeId,
            subscription_id: target.id,
            error: String(error)
          })
        }
      }
      if (answer.ok.length) answer.status = 'sent'
      else if (!transient) answer.status = 'failed'
    } else if (out.email) {
      try {
        const { providerMessageId } = await deps.email().send({
          ...out.email,
          from: 'system',
          category: 'approver_alert'
        })
        Object.assign(answer, { status: 'sent', providerMessageId, acceptedAt: deps.now() })
      } catch (error) {
        if (permanent(error)) answer.status = 'failed'
        log('ERROR', 'approver email failed', {
          notice_id: out.noticeId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
  return answers
}

/** Writes the answers in the caller's transaction. */
export async function record(tx: Tx, deps: AlertsDeps, answers: Answer[]) {
  const now = deps.now()
  for (const { out, status, providerMessageId, acceptedAt, gone, ok } of answers) {
    await settlePushSubscriptions(tx, { gone, ok, now })
    if (!out.noticeId || status === 'queued') continue
    await settleNotice(tx, out.noticeId, { status, providerMessageId, acceptedAt, now })
    if (status !== 'sent' || out.subject?.kind !== 'alert' || !acceptedAt) continue
    const channel = out.channel === 'push' ? 'web_push' : 'email'
    const { bundleId, level } = out.subject
    const inserted = await insertBundleAlert(tx, { bundleId, accountId: out.accountId, channel, level, acceptedAt })
    // The "Approver alerted" SLI: Needs review to the first acceptance, for the on-duty alert.
    if (inserted && level === 'on_duty' && out.needsReviewAt) {
      const seconds = Math.max(0, Math.round((acceptedAt.getTime() - out.needsReviewAt.getTime()) / 1000))
      await track(tx, 'approver_alerted', { channel, seconds }, { projectId: out.projectId ?? undefined })
    }
  }
}

/** Posts what a committed transaction prepared, then records the answers in the organisation. */
export async function deliver(orgId: string, deps: AlertsDeps, outgoing: Outgoing[]) {
  if (!outgoing.length) return
  const answers = await post(deps, outgoing)
  await inOrg(orgId, (tx) => record(tx, deps, answers))
}
