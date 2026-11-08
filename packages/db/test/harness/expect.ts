// #79 §7's assertions on the shared writes: exactly one matching row, read as the superuser so RLS hides nothing.
import type { AuditAction, EventType } from '@skyclause/contracts'
import { asLogin } from './index'

type Row = Record<string, unknown>

async function exactlyOne(table: string, what: string, where: Record<string, string | undefined>): Promise<Row> {
  const filters = Object.entries(where).filter((entry): entry is [string, string] => entry[1] !== undefined)
  const rows = await asLogin('postgres', async (client) => {
    const clause = filters.map(([column], i) => `${column} = $${i + 1}`).join(' AND ')
    const { rows } = await client.query<Row>(
      `SELECT * FROM ${table} WHERE ${clause}`,
      filters.map(([, value]) => value)
    )
    return rows
  })
  if (rows.length !== 1) throw new Error(`expected one ${what}, found ${rows.length}`)
  return rows[0]!
}

/** The one `audit_event` row with `action` (and the filters); fails on none or several. */
export function expectOneAudit(
  action: AuditAction,
  filter: { orgId?: string; projectId?: string; targetId?: string } = {}
) {
  return exactlyOne('audit_event', `audit_event ${action}`, {
    action,
    org_id: filter.orgId,
    project_id: filter.projectId,
    target_id: filter.targetId
  })
}

/** The one `domain_event` row of `type` (and the filters); fails on none or several. */
export function expectEvent(type: EventType, filter: { orgId?: string; projectId?: string } = {}) {
  return exactlyOne('domain_event', `domain_event ${type}`, {
    type,
    org_id: filter.orgId,
    project_id: filter.projectId
  })
}
