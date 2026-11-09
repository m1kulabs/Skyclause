// #154 c-ics-feed, RLS P (#79 §3): public_reader reads what the conditions calendar needs through public_bundle,
// public_window, public_night and public_listing: a public project's rows that a sent call refers to, and nothing of a
// private project.
import { expect, test } from 'vitest'
import { publicBundle, publicListing, publicNight, publicWindow, withPublicReader, withTenant } from '../src'
import {
  makeBundle,
  makeCall,
  makeListing,
  makeNight,
  makeOrganization,
  makeProject,
  makeRun,
  makeWindow
} from './factories'
import { memberOf } from './harness'

test('the feed’s views show a public project’s bundles, windows, nights and listed listings of sent calls only', async () => {
  const orgId = (await makeOrganization()).id
  const made = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const rowsIn = async (isPublic: boolean) => {
      const projectId = (await makeProject(tx, { public: isPublic })).id
      // Drafted runs, since a project holds one queued run per pack.
      const bundle = async (pack: 'sky' | 'crowd') =>
        (await makeBundle(tx, { runId: (await makeRun(tx, { projectId, pack, status: 'drafted' })).id })).id
      const [sky, crowd, drafted] = [await bundle('sky'), await bundle('crowd'), await bundle('sky')]
      const [window, unsentWindow] = [
        (await makeWindow(tx, { projectId })).id,
        (await makeWindow(tx, { projectId })).id
      ]
      const [night, unsentNight] = [(await makeNight(tx, { projectId })).id, (await makeNight(tx, { projectId })).id]
      const sent = { state: 'sent' as const, approvedAt: new Date(), sentAt: new Date() }
      await makeCall(tx, { bundleId: sky, windowId: window, mode: 'commute_disruption', ...sent })
      await makeCall(tx, { bundleId: crowd, nightId: night, mode: 'surge_night', ...sent })
      await makeCall(tx, { bundleId: drafted, windowId: unsentWindow, mode: 'commute_disruption' })
      await makeCall(tx, { bundleId: drafted, nightId: unsentNight, mode: 'surge_night' })
      const listing = async (nightId: string, state: 'proposed' | 'listed' | 'rejected' | 'cancelled') =>
        (await makeListing(tx, { projectId, nightId, state })).id
      return {
        bundles: [sky, crowd],
        windows: [window],
        nights: [night],
        listings: [await listing(night, 'listed'), await listing(night, 'cancelled')],
        hidden: [
          drafted,
          unsentWindow,
          unsentNight,
          await listing(night, 'proposed'),
          await listing(night, 'rejected'),
          await listing(unsentNight, 'listed')
        ]
      }
    }
    return { open: await rowsIn(true), closed: await rowsIn(false) }
  })

  const seen = await withPublicReader(async (tx) => ({
    bundles: (await tx.select({ id: publicBundle.id }).from(publicBundle)).map(({ id }) => id),
    windows: (await tx.select({ id: publicWindow.id }).from(publicWindow)).map(({ id }) => id),
    nights: (await tx.select({ id: publicNight.id }).from(publicNight)).map(({ id }) => id),
    listings: (await tx.select({ id: publicListing.id }).from(publicListing)).map(({ id }) => id)
  }))
  const ours = new Set([made.open, made.closed].flatMap((rows) => Object.values(rows).flat()))
  const mine = (ids: string[]) => ids.filter((id) => ours.has(id)).sort()
  expect({
    bundles: mine(seen.bundles),
    windows: mine(seen.windows),
    nights: mine(seen.nights),
    listings: mine(seen.listings)
  }).toEqual({
    bundles: [...made.open.bundles].sort(),
    windows: made.open.windows,
    nights: made.open.nights,
    listings: [...made.open.listings].sort()
  })
})
