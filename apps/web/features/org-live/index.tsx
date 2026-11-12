'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { DomainEventSchema } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { usePathname, useRouter } from 'next/navigation'
import { announce } from '../../lib/announce'
import { browserPath } from '../../lib/api-fetch'
import { readSse, type SseEvent } from '../../lib/read-sse'
import { apiFetch, orgEventStream } from './operations'
import { getApprovalsCount, setApprovalsCount, startOrgLive, stopOrgLive, subscribeToApprovalsCount } from './store'
import styles from './org-live.module.css'

export interface OrgLiveProps {
  org: string
}

export interface ApprovalsCountProps {
  org?: string
}

const MODE_LABELS: Record<string, string> = {
  normal: 'Normal',
  outdoor_limited: 'Outdoor-limited',
  commute_disruption: 'Commute disruption',
  hybrid_recommended: 'Hybrid recommended',
  surge_night: 'Surge night'
}

const ANNOUNCEMENT_GAP_MS = 50
const REFRESH_DELAY_MS = 1_000

function pathOrg(pathname: string | null) {
  return pathname?.split('/').filter(Boolean)[0]
}

function shouldRefresh(pathname: string | null) {
  const segments = pathname?.split('/').filter(Boolean) ?? []
  return segments.length === 1 || (segments.length === 2 && segments[1] === 'approvals')
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function snapshotState(raw: string): { bundleIds: Set<string>; sourceErrors: Set<string> } | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  const snapshot = record(value)
  if (!snapshot) return undefined

  const bundles = snapshot.needs_review ?? snapshot.needs_review_bundle_ids ?? snapshot.bundle_ids ?? snapshot.bundles
  const rawSources = snapshot.sources ?? snapshot.source_states ?? snapshot.source_errors
  if (!Array.isArray(bundles)) return undefined
  const sourceMap = record(rawSources)
  const sources = Array.isArray(rawSources)
    ? rawSources
    : sourceMap
      ? Object.entries(sourceMap).map(([source_id, state]) => ({ source_id, state }))
      : undefined
  if (!sources) return undefined

  const bundleIds = new Set<string>()
  for (const item of bundles) {
    if (typeof item === 'string') bundleIds.add(item)
    else {
      const entry = record(item)
      const id = entry?.bundle_id ?? entry?.id
      if (typeof id === 'string') bundleIds.add(id)
    }
  }

  const sourceErrors = new Set<string>()
  for (const item of sources) {
    if (typeof item === 'string') {
      sourceErrors.add(item)
      continue
    }
    const entry = record(item)
    const id = entry?.source_id ?? entry?.id
    const state = record(entry?.state)?.state ?? entry?.state
    if (typeof id === 'string' && state === 'error') sourceErrors.add(id)
  }

  return { bundleIds, sourceErrors }
}

function updateTab(count: number) {
  if (typeof document === 'undefined') return

  const title = document.title.replace(/^\(\d+\)\s+/, '')
  const nextTitle = count > 0 ? `(${count}) ${title}` : title
  if (document.title !== nextTitle) document.title = nextTitle

  try {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')
    if (!icon) return

    if (count === 0) {
      const originalHref = icon.dataset.orgLiveOriginalHref
      if (originalHref && icon.getAttribute('href') !== originalHref) icon.setAttribute('href', originalHref)
      delete icon.dataset.orgLiveOriginalHref
      return
    }

    icon.dataset.orgLiveOriginalHref ??= icon.getAttribute('href') ?? '/icon.svg'
    const href = `/brand/tab-${count > 9 ? '9+' : count}.svg`
    if (icon.getAttribute('href') !== href) icon.setAttribute('href', href)
  } catch {
    // The title remains useful if this browser refuses a live favicon change.
  }
}

function minutesUntil(instant: string) {
  const difference = Date.parse(instant) - Date.now()
  return Number.isFinite(difference) ? Math.max(0, Math.ceil(difference / 60_000)) : undefined
}

function minutesPast(instant: string) {
  const difference = Date.now() - Date.parse(instant)
  return Number.isFinite(difference) ? Math.max(0, Math.floor(difference / 60_000)) : undefined
}

function modeLabel(mode: string | null | undefined) {
  return mode ? (MODE_LABELS[mode] ?? mode.replaceAll('_', ' ')) : 'No call'
}

function waitForAnnouncement(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ANNOUNCEMENT_GAP_MS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function announceBundle(
  org: string,
  bundleId: string,
  kind: 'needs_review' | 'escalated',
  fallbackSla: string | null,
  signal: AbortSignal
) {
  try {
    const bundle = await apiFetch('getBundle', { params: { id: bundleId }, org, signal })
    const project = await apiFetch('getProject', { params: { id: bundle.project_id }, org, signal })
    const sla = bundle.sla_due_at ?? fallbackSla
    if (!sla || !project.name.trim() || signal.aborted) return

    const mode = modeLabel(bundle.calls.find((call) => call.mode)?.mode)
    const minutes = kind === 'needs_review' ? minutesUntil(sla) : minutesPast(sla)
    if (minutes === undefined) return

    announce(
      kind === 'needs_review'
        ? `New bundle needs review: ${mode}, ${project.name}, ${minutes} min SLA`
        : `Bundle escalated: ${mode}, ${project.name}, ${minutes} min past SLA`
    )
    await waitForAnnouncement(signal)
  } catch {
    // Keep the stream live if an optional announcement detail read fails.
  }
}

function sourceTime(instant: string) {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) return undefined
  return formatTime(date, 'en')
}

export function OrgLive({ org }: OrgLiveProps) {
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const router = useRouter()
  pathnameRef.current = pathname

  useEffect(() => {
    updateTab(getApprovalsCount(org))
  }, [org, pathname])

  useEffect(() => {
    const observer = new MutationObserver(() => updateTab(getApprovalsCount(org)))
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ['href'],
      childList: true,
      subtree: true
    })
    return () => observer.disconnect()
  }, [org])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const bundleIds = new Set<string>()
    const sourceErrors = new Set<string>()
    const seenEventIds = new Set<string>()
    const sourceNames = new Map<string, string>()
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    startOrgLive(org)
    updateTab(0)

    const scheduleRefresh = () => {
      if (!shouldRefresh(pathnameRef.current)) return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        if (shouldRefresh(pathnameRef.current)) router.refresh()
      }, REFRESH_DELAY_MS)
    }

    const publishCount = () => {
      setApprovalsCount(org, bundleIds.size)
      updateTab(bundleIds.size)
    }

    const sourceName = async (projectId: string, sourceId: string) => {
      const key = `${projectId}:${sourceId}`
      const cached = sourceNames.get(key)
      if (cached) return cached

      let cursor: string | undefined
      const seenCursors = new Set<string>()
      do {
        const page = await apiFetch('listProjectSources', {
          params: { id: projectId },
          query: { limit: 200, cursor },
          org,
          signal
        })
        const match = page.data.find((item) => item.id === sourceId)
        if (match?.name.trim()) {
          sourceNames.set(key, match.name)
          return match.name
        }
        cursor = page.next_cursor ?? undefined
        if (cursor && seenCursors.has(cursor)) break
        if (cursor) seenCursors.add(cursor)
      } while (cursor && !signal.aborted)
    }

    const handleEvent = async (sse: SseEvent) => {
      if (signal.aborted) return
      if (sse.event === 'snapshot') {
        const snapshot = snapshotState(sse.data)
        if (!snapshot) return
        bundleIds.clear()
        snapshot.bundleIds.forEach((id) => bundleIds.add(id))
        sourceErrors.clear()
        snapshot.sourceErrors.forEach((id) => sourceErrors.add(id))
        publishCount()
        return
      }

      let raw: unknown
      try {
        raw = JSON.parse(sse.data)
      } catch {
        return
      }
      const parsed = DomainEventSchema.safeParse(raw)
      if (!parsed.success || seenEventIds.has(parsed.data.id)) return
      const event = parsed.data
      seenEventIds.add(event.id)

      if (event.type.startsWith('bundle.') || event.type.startsWith('source.')) scheduleRefresh()

      switch (event.type) {
        case 'bundle.needs_review':
          bundleIds.add(event.data.bundle_id)
          publishCount()
          await announceBundle(org, event.data.bundle_id, 'needs_review', event.data.sla_due_at, signal)
          break
        case 'bundle.escalated':
          await announceBundle(org, event.data.bundle_id, 'escalated', event.data.sla_due_at, signal)
          break
        case 'bundle.approved':
        case 'bundle.superseded':
        case 'bundle.expired':
          bundleIds.delete(event.data.bundle_id)
          publishCount()
          break
        case 'source.error': {
          if (sourceErrors.has(event.data.source_id)) break
          sourceErrors.add(event.data.source_id)
          let name: string | undefined
          try {
            name = await sourceName(event.project_id, event.data.source_id)
          } catch {
            // A failed source detail read must not close the organisation stream.
          }
          const since = sourceTime(event.data.since)
          if (name && since && !signal.aborted) {
            announce(`${name} error since ${since}`)
            await waitForAnnouncement(signal)
          }
          break
        }
        case 'source.recovered':
          sourceErrors.delete(event.data.source_id)
          break
      }
    }

    void readSse(browserPath(orgEventStream.path), {
      headers: { 'Skyclause-Organization': org },
      resume: false,
      signal,
      onEvent: handleEvent
    })

    return () => {
      controller.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
      stopOrgLive(org)
      updateTab(0)
    }
  }, [org, router])

  return null
}

export function ApprovalsCount({ org }: ApprovalsCountProps) {
  const pathname = usePathname()
  const badge = useRef<HTMLSpanElement>(null)
  const currentOrg = org ?? pathOrg(pathname)
  const count = useSyncExternalStore(
    subscribeToApprovalsCount,
    () => getApprovalsCount(currentOrg),
    () => 0
  )

  useEffect(() => {
    const link = badge.current?.closest('a')
    if (!link) return

    const originalLabel = link.getAttribute('aria-label')
    const label = `Approvals, ${count} need review`
    link.setAttribute('aria-label', label)
    return () => {
      if (link.getAttribute('aria-label') !== label) return
      if (originalLabel === null) link.removeAttribute('aria-label')
      else link.setAttribute('aria-label', originalLabel)
    }
  }, [count])

  if (count === 0) return null
  return <span ref={badge} aria-hidden="true" className={styles.count} data-count={count > 9 ? '9+' : count} />
}
