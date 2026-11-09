import type { EventData } from '@skyclause/contracts'
import { assignIcsIdentity, bumpNightEntry, bumpWindowEntries } from '@skyclause/db'
import { onEvent } from '../events'
import type { WorkerPart } from '../server'

// #154 c-ics-feed: consumer `ics` (#79 §5) keeps each conditions calendar entry's UID and SEQUENCE (D20) on the call
// rows the feed reads. `now` stamps each write, which the feed shows as the entry's DTSTAMP and Last-Modified.

const TYPES = ['call.sent', 'window.cancelled', 'window.updated', 'listing.changed'] as const

export function icsPart(now: () => Date = () => new Date()): WorkerPart {
  return {
    owner: 'c-ics-feed',
    events: [
      onEvent([...TYPES], 'ics', async (event, tx) => {
        if (event.type === 'call.sent') {
          await assignIcsIdentity(tx, (event.data as EventData<'call.sent'>).call_id, now())
        } else if (event.type === 'listing.changed') {
          await bumpNightEntry(tx, (event.data as EventData<'listing.changed'>).night_id, now())
        } else {
          // NTC-2 raises SEQUENCE on each change: a cancellation, or new times, which move DTSTART and DTEND.
          const data = event.data as EventData<'window.cancelled' | 'window.updated'>
          if (event.type === 'window.cancelled' || data.times_changed)
            await bumpWindowEntries(tx, data.window_id, now())
        }
      })
    ]
  }
}

export const ics = icsPart()
