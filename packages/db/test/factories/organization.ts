import { randomUUID } from 'node:crypto'
import { authDatabase } from '../../src/auth'
import { organization } from '../../src/schema'

/** A Better Auth organisation, written as `auth_app` does. */
export async function makeOrganization(overrides: Partial<typeof organization.$inferInsert> = {}) {
  const [row] = await authDatabase()
    .insert(organization)
    .values({ name: 'Test organisation', slug: `org-${randomUUID()}`, createdAt: new Date(), ...overrides })
    .returning()
  return row!
}
