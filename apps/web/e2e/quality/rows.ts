// The rows a crawled page reads, written in Playwright's test database (#94) as e2e/bundles/seed.ts writes a review:
// through #92's factories, and the product's own token functions where a token is emailed and never returned. The
// crawl visits each dynamic page at a real project, bundle, source or token. Test rows only (NFR-15); the database is
// dropped after the run.
import { randomBytes } from 'node:crypto'
import { addMember, inOrg, makeAccount, makeOrg } from '@skyclause/auth/testing'
import type { SubscriberTokenPurpose } from '@skyclause/contracts'
import { insertInvitation, issueSubscriberToken, rotateSubscribeLink, tokenHash } from '@skyclause/db'
import { makeProject, makeProjectSource, makeSubscriber } from '@skyclause/db/test/factories/index'
import { bundleDouble } from '../bundles/doubles'
import { seedReview } from '../bundles/seed'
import type { TestOrg } from '../harness/sign-in-as'
import type { CrawlRoute } from './routes'

const PROJECT = 'crawl-project'
/** The token each subscriber page is reached with, as the product's emails link them. */
const SUBSCRIBER_PAGES: Record<string, SubscriberTokenPurpose> = {
  '/subscribe/[token]/confirm': 'confirm',
  '/subscribe/[token]/data': 'manage',
  '/subscribe/[token]/feedback': 'feedback',
  '/subscribe/[token]/reply': 'reply',
  '/subscribe/[token]/unsubscribe': 'unsubscribe'
}
const OTHER_PARAMS = new Set([
  '/[org]/[project]/bundles/[id]',
  '/[org]/[project]/camera/[sourceId]',
  '/invite/[token]',
  '/subscribe/[token]',
  ...Object.keys(SUBSCRIBER_PAGES)
])

/** Whether the crawl can fill every parameter of `route`'s path. */
export const fillable = (route: CrawlRoute) =>
  OTHER_PARAMS.has(route.path) || (!!route.params && !/\[(?!org\]|project\])/.test(route.path))

/**
 * Writes the rows `route`'s page reads and returns the path that reaches them: in `org`, the role's organisation, or
 * in a new one for a token or a role without one. A project page signed out keeps its made-up organisation.
 */
export async function crawlPath(route: CrawlRoute, org: TestOrg | null): Promise<string> {
  const { path } = route
  if (path === '/[org]/[project]/bundles/[id]') return (await seedReview(org ?? (await makeOrg()), bundleDouble())).path
  if (path === '/[org]/[project]/camera/[sourceId]') {
    const owner = org ?? (await makeOrg())
    const bound = await inOrg(owner.id, async (tx) =>
      makeProjectSource(tx, { projectId: (await makeProject(tx, { slug: PROJECT })).id })
    )
    return `/${owner.slug}/${PROJECT}/camera/${bound.sourceId}`
  }
  if (path === '/invite/[token]') {
    // createInvitation keeps the token only in its email, so the invitation is written as it writes one.
    const inviting = await makeOrg()
    const inviter = await makeAccount()
    await addMember(inviting.id, inviter.id, 'owner')
    const token = randomBytes(32).toString('base64url')
    await inOrg(inviting.id, (tx) =>
      insertInvitation(tx, {
        email: `invitee-${randomBytes(4).toString('hex')}@example.test`,
        role: 'editor',
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        inviterId: inviter.id,
        tokenHash: tokenHash(token)
      })
    )
    return `/invite/${token}`
  }
  if (path.startsWith('/subscribe/[token]')) {
    const token = await inOrg((await makeOrg()).id, async (tx) => {
      const project = await makeProject(tx)
      if (path === '/subscribe/[token]') return (await rotateSubscribeLink(tx, project.id)).token
      // A reply or feedback token names no call or window here: those pages read nothing until they're submitted.
      const subscriber = await makeSubscriber(tx, { projectId: project.id })
      return issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: SUBSCRIBER_PAGES[path]! })
    })
    return path.replace('[token]', token)
  }
  if (org && route.params?.includes('project')) await inOrg(org.id, (tx) => makeProject(tx, { slug: PROJECT }))
  return path.replace('[org]', encodeURIComponent(org?.slug ?? 'crawl-org')).replace('[project]', PROJECT)
}
