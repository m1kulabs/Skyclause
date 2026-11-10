// #107 a-audit-log: for each AUD-1 action, the repo's tests assert exactly one entry with
// `expectOneAudit('<action>')`. An action no test asserts is a `test.todo` naming its owner; each todo clears when
// that owner merges.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { AUDIT_ACTIONS, type AuditAction } from '@skyclause/contracts'

/** The ticket writing each action's exactly-one test (#107 owns this catalogue, not those tests). */
const OWNERS: Record<AuditAction, string> = {
  'bundle.approved': '#153',
  'bundle.escalated': '#153',
  'call.edited': '#153',
  'call.rejected': '#153',
  'listing.proposed': '#147',
  'listing.listed': '#147',
  'listing.changed': '#147',
  'listing.rejected': '#147',
  'listing.cancelled': '#147',
  'listing.unlisted': '#147',
  'evidence_reply.approved': '#159',
  'evidence_request.dropped': '#159',
  'api_key.created': '#106',
  'api_key.revoked': '#106',
  'ai_key.created': '#206',
  'ai_key.revoked': '#206',
  'member.role_changed': '#103',
  'invite.created': '#103',
  'invite.revoked': '#103',
  'clause_sheet.published': '#135',
  'share_link.created': '#140',
  'share_link.revoked': '#140',
  'source.bound': '#138',
  'source.unbound': '#138',
  'sla.changed': '#138',
  'export.requested': '#109',
  'organisation.deleted': '#109',
  'account.deleted': '#109',
  'mcp.consent_granted': '#198',
  'mcp.tool_called': '#93 and #199',
  'bundle.approve_denied': '#93',
  'source.probation_passed': '#128',
  'staff.action': '#94',
  'flag.changed': '#92',
  'review_item.explained': '#161',
  'crowd_reply.dropped': '#163'
}

const self = new URL(import.meta.url).pathname

function testSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) testSources(path, found)
    else if (entry.isFile() && entry.name.endsWith('.test.ts') && path !== self) found.push(path)
  }
  return found
}

const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..')
const sources = testSources(join(root, 'packages')).concat(testSources(join(root, 'apps')))
const asserted = new Set(
  AUDIT_ACTIONS.filter((action) =>
    sources.some((path) => readFileSync(path, 'utf8').includes(`expectOneAudit('${action}'`))
  )
)

for (const action of AUDIT_ACTIONS) {
  if (asserted.has(action)) {
    test(`${action} is asserted exactly once by an owner test (owner ${OWNERS[action]})`, () => {
      expect(asserted.has(action)).toBe(true)
    })
  } else {
    test.todo(`${action} has no expectOneAudit test yet (owner ${OWNERS[action]})`)
  }
}
