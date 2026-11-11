import { metrics } from '@opentelemetry/api'
import { log } from '@skyclause/config'
import { METRICS, type EmailTransport, type Notify } from '@skyclause/contracts'
import {
  listAuditOrganisations,
  notify,
  reconcileAuditFindings,
  runAuditCheck,
  systemPrincipal,
  withSystem,
  withTenant,
  type AuditFindingRow,
  type Tx
} from '@skyclause/db'
import { emailTransportFromEnv } from '@skyclause/delivery'
import type { WorkerPart } from '../server'
import { auditChecks, type AuditCheck } from './registry'

export { auditChecks, createAuditRegistry, registerAuditCheck } from './registry'

// Only callback failures are isolated. Connection acquisition or failed rollback must abort traversal without a beat.
class CheckFailure extends Error {
  constructor(cause: unknown) {
    super('auditor check failed', { cause })
  }
}

/** The batch auditor; dependencies are resolved on use, so importing the registry opens no connections. */
export function createAuditor(
  options: {
    checks?: () => readonly AuditCheck[]
    notify?: Notify
    email?: EmailTransport
    staffEmails?: () => readonly string[]
    heartbeat?: () => void
  } = {}
): WorkerPart {
  let email = options.email
  const sendTransition = async (tx: Tx, row: AuditFindingRow, recovered: boolean) => {
    const ref = { type: row.refType, id: row.refId }
    if (row.orgId !== null) {
      if (!row.accountIds.length) {
        log.warn('auditor finding has no recipients', { check: row.check, orgId: row.orgId, findingId: row.id })
        return
      }
      await (options.notify ?? notify)(tx, {
        accountIds: row.accountIds,
        kind: 'auditor',
        ref,
        ...(row.projectId === null ? {} : { projectId: row.projectId }),
        ...(recovered ? { recovered: true } : {})
      })
      return
    }
    const recipients = [
      ...new Set(
        (options.staffEmails?.() ?? (process.env.SKYCLAUSE_STAFF_EMAILS ?? '').split(','))
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ]
    if (!recipients.length) {
      log.warn('auditor platform finding has no staff recipients', { check: row.check, findingId: row.id })
      return
    }
    email ??= emailTransportFromEnv('worker') ?? undefined
    if (!email) throw new Error('auditor email transport is not configured')
    const transition = recovered ? 'recovered' : 'opened'
    // Resend deduplicates the same message under this key for 24 hours, so a retry after partial delivery within a day
    // doesn't mail a recipient twice.
    for (const to of recipients)
      await email.send({
        to,
        from: 'system',
        category: 'auditor',
        idempotencyKey: `auditor:${row.id}:${transition}`,
        subject: `Auditor ${transition}: ${row.check} / ${row.key}`,
        text: `Auditor condition ${transition}\nCheck: ${row.check}\nKey: ${row.key}\nReference: ${ref.type} / ${ref.id}`
      })
  }
  return {
    owner: 'b-auditor',
    batch: {
      auditor: async (now) => {
        const checks = [...(options.checks ?? auditChecks)()]
        const clock = now.toISOString()
        const orgIds = await withSystem('auditor', listAuditOrganisations)
        let failures = 0
        const evaluate = async (check: AuditCheck, orgId: string | null) => {
          const work = async (tx: Tx) => {
            try {
              const findings = await runAuditCheck(tx, (scoped) => check.run(scoped, clock))
              if (orgId === null && findings.some((f) => f.projectId !== null))
                throw new Error('platform audit findings require null projectId')
              const transitions = await reconcileAuditFindings(tx, { check: check.name, orgId, now, findings })
              for (const row of transitions.opened) await sendTransition(tx, row, false)
              for (const row of transitions.recovered) await sendTransition(tx, row, true)
            } catch (error) {
              throw new CheckFailure(error)
            }
          }
          try {
            if (orgId === null) await withSystem('auditor', work)
            else await withTenant({ orgId, principal: systemPrincipal('auditor') }, work)
          } catch (error) {
            if (!(error instanceof CheckFailure)) throw error
            failures++
            log.error('auditor check failed', { check: check.name, orgId, failures, error: String(error.cause) })
          }
        }
        for (const check of checks) {
          if (check.scope === 'platform') await evaluate(check, null)
          else for (const orgId of orgIds) await evaluate(check, orgId)
        }
        if (options.heartbeat) options.heartbeat()
        else metrics.getMeter('skyclause').createGauge(METRICS.heartbeat).record(1, { name: 'auditor' })
      }
    }
  }
}

export const auditor = createAuditor()
