// #154 c-ics-feed, RLS P (#79 §3): public_reader reads what the conditions calendar may show through public_bundle,
// public_window, public_night and public_listing: a public project's rows that a sent call refers to, without guest
// windows (GST-5), draft-only bundles or never-listed nights (CAL-14), and nothing of a private project.
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

type ListingState = 'proposed' | 'listed' | 'rejected' | 'cancelled'

test('the feed’s views show a public project’s rows of sent calls the calendar may show, and nothing else', async () => {
  const orgId = (await makeOrganization()).id
  const made = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const rowsIn = async (isPublic: boolean) => {
      const projectId = (await makeProject(tx, { public: isPublic })).id
      // Drafted runs, since a project holds one queued run per pack.
      const bundle = async (pack: 'sky' | 'crowd', draftOnly = false) =>
        (await makeBundle(tx, { runId: (await makeRun(tx, { projectId, pack, status: 'drafted' })).id, draftOnly })).id
      const [sky, crowd, drafted, draftOnly] = [
        await bundle('sky'),
        await bundle('crowd'),
        await bundle('sky'),
        await bundle('sky', true)
      ]
      const window = (guest = false) => makeWindow(tx, { projectId, guest, via: guest ? 'guest' : 'app' })
      const [shown, unsentWindow, guestWindow] = [(await window()).id, (await window()).id, (await window(true)).id]
      const night = async (states: ListingState[]) => {
        const id = (await makeNight(tx, { projectId })).id
        for (const state of states) await makeListing(tx, { projectId, nightId: id, state })
        return id
      }
      const listed = await night(['listed', 'cancelled', 'proposed', 'rejected'])
      const [unsentNight, proposedNight] = [await night(['listed']), await night(['proposed'])]

      const sent = { state: 'sent' as const, approvedAt: new Date(), sentAt: new Date() }
      await makeCall(tx, { bundleId: sky, windowId: shown, mode: 'commute_disruption', ...sent })
      await makeCall(tx, { bundleId: sky, windowId: guestWindow, mode: 'commute_disruption', ...sent })
      await makeCall(tx, { bundleId: draftOnly, windowId: shown, mode: 'commute_disruption', ...sent })
      await makeCall(tx, { bundleId: crowd, nightId: listed, mode: 'surge_night', ...sent })
      await makeCall(tx, { bundleId: crowd, nightId: proposedNight, mode: 'surge_night', ...sent })
      await makeCall(tx, { bundleId: drafted, windowId: unsentWindow, mode: 'commute_disruption' })
      await makeCall(tx, { bundleId: drafted, nightId: unsentNight, mode: 'surge_night' })
      return {
        shown: {
          bundles: [sky, crowd].sort(),
          windows: [shown],
          nights: [listed],
          listings: [`${listed} cancelled`, `${listed} listed`]
        },
        ids: [sky, crowd, drafted, draftOnly, shown, unsentWindow, guestWindow, listed, unsentNight, proposedNight]
      }
    }
    return { open: await rowsIn(true), closed: await rowsIn(false) }
  })

  const seen = await withPublicReader(async (tx) => ({
    bundles: (await tx.select({ id: publicBundle.id }).from(publicBundle)).map(({ id }) => id),
    windows: (await tx.select({ id: publicWindow.id }).from(publicWindow)).map(({ id }) => id),
    nights: (await tx.select({ id: publicNight.id }).from(publicNight)).map(({ id }) => id),
    listings: (await tx.select({ nightId: publicListing.nightId, state: publicListing.state }).from(publicListing)).map(
      ({ nightId, state }) => `${nightId} ${state}`
    )
  }))
  const ours = new Set([...made.open.ids, ...made.closed.ids])
  const mine = (keys: string[]) => keys.filter((key) => ours.has(key.split(' ')[0]!)).sort()
  expect({
    bundles: mine(seen.bundles),
    windows: mine(seen.windows),
    nights: mine(seen.nights),
    listings: mine(seen.listings)
  }).toEqual(made.open.shown)
})
