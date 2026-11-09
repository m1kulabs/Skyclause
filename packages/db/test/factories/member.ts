import { authDatabase } from '../../src/auth'
import { member } from '../../src/schema'
import { makeUser } from './user'

/** A membership of `organizationId`, for a new user unless `userId` is given. */
export async function makeMember(values: { organizationId: string } & Partial<typeof member.$inferInsert>) {
  const userId = values.userId ?? (await makeUser()).id
  const [row] = await authDatabase()
    .insert(member)
    .values({ role: 'viewer', createdAt: new Date(), ...values, userId })
    .returning()
  return row!
}
