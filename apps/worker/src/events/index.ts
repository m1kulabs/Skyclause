import type { EventEnvelope, EventType } from '@skyclause/contracts'
import {
  handleOnce,
  loadEvent,
  maintainPartitions,
  republishEvents,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import { log, type EventConsumer, type WorkerPart } from '../server'

// #79 §5: Pub/Sub `domain-events` carries `{event_id}`; each registered consumer handles each event once.

type Event<T extends EventType> = EventEnvelope & { type: T; seq: number }

/**
 * A consumer for `registry.ts`'s `events`: `handler` runs for each event of `types`, inside `withTenant` on the event's
 * organisation as system job `event:<consumer>`, through `handleOnce`, so a redelivery runs nothing.
 */
export function onEvent<T extends EventType>(
  types: T[],
  consumer: string,
  handler: (event: Event<T>, tx: Tx) => Promise<void>
): EventConsumer {
  const principal = systemPrincipal(`event:${consumer}`)
  return {
    consumer,
    types,
    handler: async (raw) => {
      const event = raw as Event<T>
      await withTenant({ orgId: event.org_id, principal }, (tx) =>
        handleOnce(tx, consumer, event.id, () => handler(event, tx))
      )
    }
  }
}

/**
 * Runs every consumer subscribed to the event's type, each to completion, then throws if any failed, so Pub/Sub
 * redelivers and `handleOnce` skips the ones that already succeeded. An event that no longer exists is acknowledged.
 */
export async function dispatchEvent(consumers: EventConsumer[], eventId: string) {
  const event = await withSystem('domain-events', (tx) => loadEvent(tx, eventId))
  if (!event) {
    log('INFO', 'domain event gone; acknowledged', { event_id: eventId })
    return
  }
  const failed: string[] = []
  for (const consumer of consumers.filter(({ types }) => types.includes(event.type))) {
    try {
      await consumer.handler(event)
    } catch (error) {
      failed.push(`${consumer.consumer}: ${String(error)}`)
    }
  }
  if (failed.length) throw new Error(`domain event ${eventId} failed in ${failed.join('; ')}`)
}

/** The part for a consumer list; `registry.ts` registers `domainEvents`, which reads the registry's own list. */
export function domainEventsFor(consumers: () => Promise<EventConsumer[]>): WorkerPart {
  return {
    owner: 'f-db-schema',
    topics: {
      'domain-events': async ({ data }) => dispatchEvent(await consumers(), (data as { event_id: string }).event_id)
    },
    batch: {
      // §5's republish runs in the 15-minute batch, since the minute tick never touches Postgres (D45).
      'domain-events-republish': async (now) => void (await republishEvents(now)),
      // Hourly: the batch that runs in a UTC hour's first quarter.
      'partition-maintenance': async (now) => {
        if (now.getUTCMinutes() < 15) await maintainPartitions()
      }
    }
  }
}

// Imported when a push arrives, not at load: registry.ts imports this file.
export const domainEvents = domainEventsFor(async () => (await import('../registry')).registry.events)
