import {
  analyticsEvent,
  createOrganisation,
  getOrganisationRecord,
  listMembershipRecords,
  member,
  organization,
  OrgSlugError,
  renameOrganisationRecord,
  toOrganisation,
  withSystem,
  withTenant,
  type Tx
} from '../src'
import { makeMember, makeOrganization, makeUser } from './factories'
import { asLogin, memberOf, tenantTables } from './harness'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'

let homeId: string

beforeAll(async () => {
  homeId = (await makeOrganization({ slug: 'db-orgs-home' })).id
})

/** A non-system caller in an existing organisation. */
const inHome = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: homeId, principal: memberOf(homeId) }, fn)
/** A system job, the only caller that may take a reserved slug. */
const asSystem = <T>(fn: (tx: Tx) => Promise<T>) => withSystem('orgs-test', fn)

describe('createOrganisation (#102)', () => {
  test('creates the org with plan community, the owner member, one org_created analytic and nothing else', async () => {
    const owner = await makeUser()
    const { orgId } = await asSystem((tx) =>
      createOrganisation(tx, { name: 'River Watch', slug: 'river-watch', ownerAccountId: owner.id })
    )

    const [org] = await asLogin('postgres', (client) =>
      client.query('SELECT id, name, slug, plan FROM auth.organization WHERE id = $1', [orgId]).then((r) => r.rows)
    )
    expect(org).toMatchObject({ name: 'River Watch', slug: 'river-watch', plan: 'community' })

    // ORG-1: every org_id table holds zero rows for the new org, apart from the org_created analytic; the only
    // Better Auth organizationId row is the creator's member row.
    for (const table of await tenantTables()) {
      if (table === 'analytics_event') continue
      const rows = await asLogin('postgres', (client) =>
        client.query(`SELECT 1 FROM public.${table} WHERE org_id = $1 LIMIT 1`, [orgId]).then((r) => r.rows)
      )
      expect(rows, table).toEqual([])
    }
    const events = await asLogin('postgres', (client) =>
      client.query('SELECT name, props FROM analytics_event WHERE org_id = $1', [orgId]).then((r) => r.rows)
    )
    expect(events).toEqual([{ name: 'org_created', props: { plan: 'community' } }])
    const members = await asLogin('postgres', (client) =>
      client.query('SELECT user_id, role FROM auth.member WHERE organization_id = $1', [orgId]).then((r) => r.rows)
    )
    expect(members).toEqual([{ user_id: owner.id, role: 'owner' }])
    expect(
      await asLogin('postgres', (client) =>
        client.query('SELECT 1 FROM auth.organization WHERE id = $1', [orgId]).then((r) => r.rowCount)
      )
    ).toBe(1)
  })

  test('null owner creates no member row (for #179)', async () => {
    const { orgId } = await asSystem((tx) =>
      createOrganisation(tx, { name: 'Commons', slug: 'commons-test-org', ownerAccountId: null })
    )
    const members = await asLogin('postgres', (client) =>
      client.query('SELECT 1 FROM auth.member WHERE organization_id = $1', [orgId]).then((r) => r.rows)
    )
    expect(members).toEqual([])
  })

  test('reserved slugs are refused with the reason; a system caller may take one', async () => {
    await expect(
      inHome((tx) => createOrganisation(tx, { name: 'New', slug: 'new', ownerAccountId: null }))
    ).rejects.toMatchObject({
      name: 'OrgSlugError',
      code: 'slug-reserved',
      message: 'new is reserved. Choose another slug.'
    })
    const { orgId } = await asSystem((tx) =>
      createOrganisation(tx, { name: 'System new', slug: 'new', ownerAccountId: null })
    )
    expect(typeof orgId).toBe('string')
  })

  test('a slug already in use is refused as taken, and malformed slugs name the format', async () => {
    await asSystem((tx) => createOrganisation(tx, { name: 'Taken', slug: 'taken-org', ownerAccountId: null }))
    await expect(
      inHome((tx) => createOrganisation(tx, { name: 'Taken again', slug: 'taken-org', ownerAccountId: null }))
    ).rejects.toMatchObject({
      name: 'OrgSlugError',
      code: 'slug-taken',
      message: 'taken-org is taken. Choose another slug.'
    })
    for (const slug of ['A', 'x', '-ab', 'ab-', 'a--b', 'a'.repeat(40), 'has space']) {
      await expect(
        inHome((tx) => createOrganisation(tx, { name: 'Bad', slug, ownerAccountId: null }))
      ).rejects.toMatchObject({
        name: 'OrgSlugError',
        code: 'validation-failed',
        message: 'Use 2–39 lowercase letters, digits and single hyphens, starting and ending with a letter or digit.'
      })
    }
    expect(new OrgSlugError('slug-taken', 'taken', 'x', 'taken')).toBeInstanceOf(Error)
  })
})

describe('organisation reads and rename (#102)', () => {
  test('lists the account memberships with org names, skipping roles outside the matrix', async () => {
    const account = await makeUser()
    const first = await makeOrganization({ slug: 'db-orgs-first', name: 'First org' })
    const second = await makeOrganization({ slug: 'db-orgs-second', name: 'Second org' })
    await makeMember({ organizationId: first.id, userId: account.id, role: 'owner' })
    await makeMember({ organizationId: second.id, userId: account.id, role: 'viewer' })
    await makeMember({ organizationId: second.id, userId: account.id, role: 'member' })

    const rows = await asSystem((tx) => listMembershipRecords(tx, account.id))
    expect(rows.map(({ orgId, role }) => ({ orgId, role }))).toEqual([
      { orgId: first.id, role: 'owner' },
      { orgId: second.id, role: 'viewer' }
    ])
    expect(rows[0]).toMatchObject({ orgName: 'First org', orgSlug: 'db-orgs-first', accountId: account.id })
  })

  test('renames the transaction organisation and reads it back as the wire shape', async () => {
    const org = await makeOrganization({ slug: 'db-orgs-rename', name: 'Old name' })
    const renamed = await withTenant({ orgId: org.id, principal: memberOf(org.id) }, (tx) =>
      renameOrganisationRecord(tx, 'New name')
    )
    expect(renamed?.name).toBe('New name')
    expect(renamed?.slug).toBe('db-orgs-rename')

    const found = await asSystem((tx) => getOrganisationRecord(tx, 'db-orgs-rename'))
    expect(toOrganisation(found!)).toMatchObject({
      id: org.id,
      name: 'New name',
      slug: 'db-orgs-rename',
      plan: 'community',
      deletion_requested_at: null,
      purge_after: null,
      onboarding_skipped: false,
      ai_fallback_enabled: false,
      allow_member_ai_keys: false
    })
    await expect(asSystem((tx) => getOrganisationRecord(tx, 'no-such-org'))).resolves.toBeNull()
  })
})

test('the seam placeholder is gone: unused schema imports still resolve', async () => {
  expect(typeof member).toBe('object')
  expect(typeof organization).toBe('object')
  expect(typeof analyticsEvent).toBe('object')
  expect(eq).toBeTypeOf('function')
})
