import { randomUUID } from 'node:crypto'
import { authDatabase } from '../../src/auth'
import { user } from '../../src/schema'

/** A Better Auth user, written as `auth_app` does. */
export async function makeUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const [row] = await authDatabase()
    .insert(user)
    .values({ name: 'Test user', email: `${randomUUID()}@example.test`, ...overrides })
    .returning()
  return row!
}
