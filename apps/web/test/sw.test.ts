// #155: `/sw.js`, the approver-alert service worker (#79 §4), run in a VM against doubles of the service worker scope.
import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { GET } from '../app/sw.js/route'

type Listener = (event: { waitUntil(p: Promise<unknown>): void } & Record<string, unknown>) => void

async function worker(clients: Array<{ url: string; focus: () => Promise<unknown> }> = []) {
  const listeners = new Map<string, Listener>()
  const shown: Array<{ title: string; options: Record<string, unknown> }> = []
  const opened: string[] = []
  const focused: string[] = []
  const self = {
    location: { origin: 'https://app.skyclause.m1ku.tech' },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options })
    },
    clients: {
      matchAll: async () => clients.map((c) => ({ ...c, focus: async () => (focused.push(c.url), c.focus()) })),
      openWindow: async (url: string) => void opened.push(url)
    }
  }
  runInNewContext(await (await GET()).text(), { self, URL })
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const pending: Array<Promise<unknown>> = []
    listeners.get(type)!({ ...event, waitUntil: (p) => void pending.push(p) })
    await Promise.all(pending)
  }
  return { dispatch, shown, opened, focused }
}

const payload = {
  title: '1 call needs review · Bukit Jalil',
  body: 'Commute disruption for 15:15–15:30 MYT · 10 min of SLA left',
  url: 'https://app.skyclause.m1ku.tech/apu/bukit-jalil/bundles/b1',
  tag: 'b1'
}

describe('/sw.js', () => {
  test('is served as JavaScript with Cache-Control: no-cache', async () => {
    const response = await GET()
    expect(response.headers.get('content-type')).toBe('application/javascript; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  test('a push shows the payload with its tag and renotify, so a later alert for the bundle replaces it', async () => {
    const sw = await worker()
    await sw.dispatch('push', { data: { json: () => payload } })
    expect(sw.shown).toEqual([
      { title: payload.title, options: { body: payload.body, tag: 'b1', renotify: true, data: { url: payload.url } } }
    ])
  })

  test('a click closes the notification and focuses a window already on the bundle', async () => {
    const sw = await worker([{ url: payload.url, focus: async () => undefined }])
    let closed = false
    await sw.dispatch('notificationclick', {
      notification: { data: { url: payload.url }, close: () => (closed = true) }
    })
    expect(closed).toBe(true)
    expect(sw.focused).toEqual([payload.url])
    expect(sw.opened).toEqual([])
  })

  test('a click with no such window opens the bundle', async () => {
    const sw = await worker([{ url: 'https://app.skyclause.m1ku.tech/apu', focus: async () => undefined }])
    await sw.dispatch('notificationclick', { notification: { data: { url: payload.url }, close: () => undefined } })
    expect(sw.opened).toEqual([payload.url])
    expect(sw.focused).toEqual([])
  })
})
