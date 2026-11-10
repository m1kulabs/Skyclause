import { loadEnv, type Env } from '@skyclause/config'
import {
  BundleNeedsReviewEventSchema,
  notBuilt,
  RunFailedEventSchema,
  type EmailTransport,
  type EventEnvelope,
  type EventType,
  type PushTransport,
  type RegisterAuditCheck,
  type ShiftConditions
} from '@skyclause/contracts'
import {
  adminAccounts,
  bundle,
  bundlesDueBy,
  lockBundle,
  logEscalation,
  organization,
  settleNotice,
  staleAlertNotices,
  withSystem,
  type Tx
} from '@skyclause/db'
import { createPushTransport, emailTransportForAws } from '@skyclause/delivery'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { cloudTasks } from '../bundles/cloud-tasks'
import { onEvent } from '../events'
import type { EventConsumer, QueueHandler, WorkerPart } from '../server'
import { planReminders, reminderTask, SHIFT_REMINDERS } from './reminders'
import {
  deliver,
  inOrg,
  post,
  prepare,
  queueAndPrepare,
  record,
  type AlertsDeps,
  type NextApprovers,
  type OnDuty,
  type Outgoing
} from './send'

// #155 (c-approver-alerts): approver alerts on Needs review (CAL-18), SLA escalation (CAL-11), shift reminders
// (CAL-19), no-draft alerts (D24), the resend sweep and the auditor's no-approver check.

export type { AlertsDeps } from './send'

/** #150's queue, whose dispatcher sends this part's `sla-{bundle_id}-{level}` tasks to `approverSlaTimer`. */
export const BUNDLE_TIMERS = 'bundle-timers'
const MINUTE = 60_000

/** An `onEvent` consumer that posts what its transaction prepared once that transaction has committed. */
function afterCommit<T extends EventType>(
  types: T[],
  consumer: string,
  deps: AlertsDeps,
  handle: (event: EventEnvelope & { type: T }, tx: Tx) => Promise<Outgoing[]>
): EventConsumer {
  return {
    consumer,
    types,
    handler: async (raw) => {
      let outgoing: Outgoing[] = []
      await onEvent(types, consumer, async (event, tx) => {
        outgoing = await handle(event, tx)
      }).handler(raw)
      await deliver((raw as EventEnvelope).org_id, deps, outgoing)
    }
  }
}

/** CAL-18: everyone on duty gets a push on each device and an email when a bundle reaches Needs review. */
function onDutyAlerts(deps: AlertsDeps) {
  return afterCommit(['bundle.needs_review'], 'approver-alerts', deps, async (event, tx) => {
    const { bundle_id } = BundleNeedsReviewEventSchema.shape.data.parse(event.data)
    const [row] = await tx.select().from(bundle).where(eq(bundle.id, bundle_id))
    if (row?.state !== 'needs_review') return []
    const accounts = await deps.onDuty(tx, {
      projectId: row.projectId,
      at: row.needsReviewAt ?? new Date(event.created_at)
    })
    const subject = { kind: 'alert' as const, bundleId: row.id, level: 'on_duty' as const }
    return queueAndPrepare(tx, deps, { projectId: row.projectId, subject, accountIds: accounts })
  })
}

/**
 * CAL-11's two timers, apart from the alert so a Cloud Tasks failure retries only them: the next approver at
 * `sla_due_at`, Admins and Owners one SLA later.
 */
function slaTimers(deps: AlertsDeps) {
  return onEvent(['bundle.needs_review'], 'approver-sla-timers', async (event, tx) => {
    const { bundle_id } = BundleNeedsReviewEventSchema.shape.data.parse(event.data)
    const [row] = await tx.select().from(bundle).where(eq(bundle.id, bundle_id))
    if (row?.state !== 'needs_review' || !row.slaDueAt) return
    const due = row.slaDueAt.getTime()
    const sla = due - (row.needsReviewAt ?? new Date(event.created_at)).getTime()
    for (const [level, at] of [
      ['next_approver', due],
      ['admins', due + sla]
    ] as const) {
      await deps.schedule({
        queue: BUNDLE_TIMERS,
        name: `sla-${row.id}-${level}`,
        at: new Date(at),
        body: { org_id: event.org_id, project_id: row.projectId, bundle_id: row.id, level }
      })
    }
  })
}

const SlaBody = z.object({
  org_id: z.string(),
  project_id: z.string(),
  bundle_id: z.string(),
  level: z.enum(['next_approver', 'admins'])
})
const LEVEL = { next_approver: 1, admins: 2 } as const

/**
 * `sla-{bundle_id}-{level}` on `bundle-timers`: if the bundle is still in Needs review below the level, alerts it with
 * "Escalated to you", then, in one transaction with the `bundle_alert` rows, logs the step (`logEscalation`). A
 * retried task re-posts whatever the last attempt left queued; once the step is logged it is a no-op.
 */
export function slaTimer(deps: AlertsDeps): QueueHandler {
  return async ({ body }) => {
    const { org_id, bundle_id, level } = SlaBody.parse(body)
    const now = deps.now()
    const step = await inOrg(org_id, async (tx) => {
      const row = await lockBundle(tx, bundle_id)
      if (!row || row.state !== 'needs_review' || !row.slaDueAt || row.escalationLevel >= LEVEL[level]) return null
      const sla = row.slaDueAt.getTime() - (row.needsReviewAt ?? row.slaDueAt).getTime()
      const due = row.slaDueAt.getTime() + (level === 'admins' ? sla : 0)
      // Early by a clock's skew: fail, so Cloud Tasks retries it.
      if (now.getTime() < due) throw new Error(`bundle ${bundle_id} is not due for ${level} yet`)
      const accounts =
        level === 'next_approver'
          ? await deps.nextApprovers(tx, { projectId: row.projectId, at: now })
          : await adminAccounts(tx)
      const subject = { kind: 'alert' as const, bundleId: row.id, level }
      return {
        accounts,
        outgoing: await queueAndPrepare(tx, deps, { projectId: row.projectId, subject, accountIds: accounts })
      }
    })
    if (!step) return
    const answers = await post(deps, step.outgoing)
    await inOrg(org_id, async (tx) => {
      await lockBundle(tx, bundle_id)
      await record(tx, deps, answers)
      await logEscalation(tx, bundle_id, { level, accountIds: step.accounts, now })
    })
  }
}

/** D24: a run that drafted nothing while the clause engine holds a non-Normal verdict alerts on duty and Admins. */
function noDraftAlerts(deps: AlertsDeps) {
  return afterCommit(['run.failed'], 'no-draft-alerts', deps, async (event, tx) => {
    const { run_id, shadow_mode } = RunFailedEventSchema.shape.data.parse(event.data)
    if (!shadow_mode) return []
    const accounts = [
      ...(await deps.onDuty(tx, { projectId: event.project_id, at: new Date(event.created_at) })),
      ...(await adminAccounts(tx))
    ]
    const subject = { kind: 'no_draft' as const, runId: run_id }
    return queueAndPrepare(tx, deps, { projectId: event.project_id, subject, accountIds: accounts })
  })
}

async function organisations(): Promise<string[]> {
  const rows = await withSystem('approver-alerts', (tx) => tx.select({ id: organization.id }).from(organization))
  return rows.map((row) => row.id)
}

/**
 * The resend sweep, in the 15-minute batch (D45 keeps Postgres off the minute tick): still-queued alerts older than a
 * minute are sent again; older than an hour, they no longer alert anyone in time and end `expired`.
 */
async function resendAlerts(deps: AlertsDeps, now: Date) {
  for (const orgId of await organisations()) {
    const outgoing = await inOrg(orgId, async (tx) => {
      const fresh: string[] = []
      for (const n of await staleAlertNotices(tx, new Date(now.getTime() - MINUTE))) {
        if (n.createdAt.getTime() < now.getTime() - 60 * MINUTE)
          await settleNotice(tx, n.id, { status: 'expired', now })
        else fresh.push(n.id)
      }
      return prepare(tx, deps, fresh)
    })
    await deliver(orgId, deps, outgoing)
  }
}

type AuditCheck = Parameters<RegisterAuditCheck>[0]

/**
 * The auditor's check (#132 registers it): a bundle in Needs review within 2 minutes of its SLA, or past it, with
 * nobody on duty, is a finding for the organisation's Admins and Owners until someone is on duty or it leaves review.
 */
export function noApproverCheck(deps: Pick<AlertsDeps, 'onDuty'>): AuditCheck {
  return {
    name: 'no_approver',
    scope: 'org',
    async run(handle, now) {
      const tx = handle as Tx
      const at = new Date(now)
      const findings = []
      let admins: string[] | undefined
      for (const b of await bundlesDueBy(tx, new Date(at.getTime() + 2 * MINUTE))) {
        if ((await deps.onDuty(tx, { projectId: b.projectId, at })).length) continue
        admins ??= await adminAccounts(tx)
        findings.push({
          key: `no_approver:${b.id}`,
          projectId: b.projectId,
          accountIds: admins,
          ref: { type: 'bundle', id: b.id }
        })
      }
      return findings
    }
  }
}

export function createAlertsPart(deps: AlertsDeps): WorkerPart {
  return {
    owner: 'c-approver-alerts',
    queues: { [SHIFT_REMINDERS]: reminderTask(deps) },
    batch: {
      'shift-reminder-plan': async (now) => {
        for (const orgId of await organisations()) await inOrg(orgId, (tx) => planReminders(tx, deps, now))
      },
      'approver-alert-resend': (now) => resendAlerts(deps, now)
    },
    events: [onDutyAlerts(deps), slaTimers(deps), noDraftAlerts(deps)]
  }
}

/** SES as `worker` (#113), from the SES variables gate 4B set; built on the first send. */
function workerEmail(env: Env<'worker'>): EmailTransport {
  const { SES_REGION, AWS_ROLE_ARN, SES_CONFIGURATION_SET, EMAIL_FROM_AUTH, EMAIL_FROM_NOTICES } = env
  if (!SES_REGION || !AWS_ROLE_ARN || !SES_CONFIGURATION_SET || !EMAIL_FROM_AUTH || !EMAIL_FROM_NOTICES) {
    throw new Error('email is off: the SES variables are unset until gate 4B')
  }
  return emailTransportForAws({
    region: SES_REGION,
    roleArn: AWS_ROLE_ARN,
    configurationSet: SES_CONFIGURATION_SET,
    fromAuth: EMAIL_FROM_AUTH,
    fromNotices: EMAIL_FROM_NOTICES
  })
}

/**
 * Production's seams. Until their owners land, the rota lookups (#103) and `ShiftConditions` (#134) are placeholders,
 * so the handlers that need them fail and their work is retried.
 */
function productionDeps(): AlertsDeps {
  let env: Env<'worker'> | undefined
  const load = () => (env ??= loadEnv('worker'))
  let push: PushTransport | null | undefined
  let email: EmailTransport | undefined
  return {
    push: () => {
      if (push !== undefined) return push
      const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = load()
      return (push =
        publicKey && privateKey && subject ? createPushTransport({ publicKey, privateKey, subject }) : null)
    },
    email: () => (email ??= workerEmail(load())),
    schedule: cloudTasks(),
    onDuty: notBuilt<OnDuty>('a-members-api'),
    nextApprovers: notBuilt<NextApprovers>('a-members-api'),
    conditions: notBuilt<ShiftConditions>('b-signals-api'),
    appOrigin: () => {
      const origin = load().APP_ORIGIN
      if (!origin) throw new Error('APP_ORIGIN is unset: approver alerts link to the app')
      return origin
    },
    now: () => new Date()
  }
}

const deps = productionDeps()
export const alerts = createAlertsPart(deps)
/** Dispatched by #150's `bundle-timers` part for task names starting `sla-`. */
export const approverSlaTimer = slaTimer(deps)
/** For #132: `registerAuditCheck(noApproverAuditCheck)`. */
export const noApproverAuditCheck = noApproverCheck(deps)
