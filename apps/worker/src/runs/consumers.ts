import { CrossingDetectedEventSchema, WindowCreatedEventSchema, type RequestRun } from '@skyclause/contracts'
import { icsFeed, requestRun, RunRefused, window, type Tx } from '@skyclause/db'
import { eq } from 'drizzle-orm'
import { onEvent } from '../events'
import { log, type EventConsumer } from '../server'
import { startsRun } from './start-rule'

// #151, D14: crossings and window changes become runs through requestRun (#79 §5 consumers of `crossing.detected` and
// `window.created`, `.updated`, `.cancelled`).

const instant = (date: Date) => date.toISOString().replace('.000Z', 'Z')

/** requestRun, except that a project that isn't open (PRJ-8) acknowledges the event with no run. */
async function request(tx: Tx, r: Parameters<RequestRun>[1]) {
  try {
    await requestRun(tx, r)
  } catch (error) {
    if (!(error instanceof RunRefused)) throw error
    log('INFO', 'run refused', { project_id: r.projectId, dedupe_key: r.dedupeKey, gate: error.gate })
  }
}

const crossings = onEvent(['crossing.detected'], 'runs-crossings', async (event, tx) => {
  const data = CrossingDetectedEventSchema.shape.data.parse(event.data)
  const facts = {
    projectId: event.project_id,
    pack: data.pack,
    scope: data.scope,
    to: data.to,
    verdictHash: data.verdict_hash
  }
  if (!(await startsRun(tx, facts))) return
  const { kind, id } = data.scope
  await request(tx, {
    projectId: event.project_id,
    pack: data.pack,
    trigger: 'crossing',
    triggerRef: data.crossing_id,
    windowIds: kind === 'window' && id ? [id] : [],
    nightIds: kind === 'night' && id ? [id] : [],
    dedupeKey: `crossing:${data.crossing_id}`,
    triggeredAt: data.at
  })
})

/**
 * D14: share-link and MCP declarations and time edits start `window` runs; ICS changes, cancellations included, start
 * one `calendar` run per feed version. Guest windows never start runs (guests only "Ask for a call"); other
 * declarations and cancellations wait for the next crossing or schedule.
 */
const windows = onEvent(['window.created', 'window.updated', 'window.cancelled'], 'runs-windows', async (event, tx) => {
  const data = WindowCreatedEventSchema.shape.data.parse(event.data)
  const [w] = await tx.select().from(window).where(eq(window.id, data.window_id))
  if (!w || w.guest || data.via === 'guest') return
  const base = { projectId: w.projectId, pack: 'sky' as const, windowIds: [w.id], triggeredAt: event.created_at }

  if (data.via === 'ics') {
    const [feed] = w.icsFeedId ? await tx.select().from(icsFeed).where(eq(icsFeed.id, w.icsFeedId)) : []
    // The feed's version: its ETag, else its Last-Modified, else the refresh that read it.
    const version = feed?.etag ?? feed?.lastModified ?? (feed?.refreshedAt ? instant(feed.refreshedAt) : null)
    if (!feed || !version) {
      log('INFO', 'ICS change without a feed version; no run', { window_id: w.id })
      return
    }
    await request(tx, {
      ...base,
      trigger: 'calendar',
      triggerRef: feed.id,
      dedupeKey: `calendar:${feed.id}:${version}`
    })
    return
  }
  const declared = event.type === 'window.created' && (data.via === 'share' || data.via === 'mcp')
  const timesChanged = event.type === 'window.updated' && data.times_changed
  if (!declared && !timesChanged) return
  await request(tx, {
    ...base,
    trigger: 'window',
    triggerRef: w.id,
    dedupeKey: `window:${w.id}:${instant(w.updatedAt)}`
  })
})

export const runConsumers: EventConsumer[] = [crossings, windows]
