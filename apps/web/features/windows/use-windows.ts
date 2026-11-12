'use client'

import { useEffect, useState } from 'react'
import { ApiProblem } from '../../lib/api-fetch'
import {
  allPages,
  resolveProject,
  windowsApi,
  type WindowView,
  type FeedView,
  type DayView,
  type NightView,
  type BundleView
} from './operations'

interface WindowsData {
  windows: WindowView[]
  feeds: FeedView[]
  days: DayView[]
  nights: NightView[]
  bundles: BundleView[]
}

/** One failed read: which, the HTTP status it answered (null when it did not answer) and when. */
export interface ReadError {
  key: 'load' | 'feeds' | 'days' | 'nights' | 'bundles'
  status: number | null
  at: string
}
interface LoadState {
  loading: boolean
  data?: WindowsData
  errors: ReadError[]
}

const statusOf = (reason: unknown) => (reason instanceof ApiProblem ? reason.status : null)

/** The date and id of a window just saved, so the page can bring its date into view and mark it. */
export interface WindowsChanged {
  id?: string
  date?: string
}

export function useWindows(org: string, project: string) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<LoadState>({ loading: true, errors: [] })
  const [changed, setChanged] = useState<WindowsChanged | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const resolved = await resolveProject(org, project, controller.signal)
        const params = { id: resolved.id }
        const options = { params, org, signal: controller.signal }
        const results = await Promise.allSettled([
          allPages((cursor) =>
            windowsApi('listWindows', { ...options, query: { limit: 200, cursor, ...{ include: 'calls' } } })
          ),
          allPages((cursor) => windowsApi('listIcsFeeds', { ...options, query: { limit: 200, cursor } })),
          allPages((cursor) => windowsApi('listProjectDays', { ...options, query: { limit: 200, cursor } })),
          allPages((cursor) => windowsApi('listNights', { ...options, query: { limit: 200, cursor } })),
          allPages((cursor) => windowsApi('listProjectBundles', { ...options, query: { limit: 200, cursor } }))
        ])
        if (controller.signal.aborted) return
        const at = new Date().toISOString()
        const [windows, feeds, days, nights, bundles] = results
        const keys = ['load', 'feeds', 'days', 'nights', 'bundles'] as const
        const errors = results.flatMap((result, index) =>
          result.status === 'rejected' ? [{ key: keys[index]!, status: statusOf(result.reason), at }] : []
        )
        setState({
          loading: false,
          errors,
          data:
            windows.status === 'fulfilled'
              ? {
                  windows: windows.value.filter((window) => !window.cancelled_at),
                  feeds: feeds.status === 'fulfilled' ? feeds.value : [],
                  days: days.status === 'fulfilled' ? days.value : [],
                  nights:
                    nights.status === 'fulfilled' ? nights.value.filter((night) => night.state !== 'unlisted') : [],
                  bundles: bundles.status === 'fulfilled' ? bundles.value : []
                }
              : undefined
        })
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            loading: false,
            errors: [{ key: 'load', status: statusOf(error), at: new Date().toISOString() }]
          })
      }
    }
    void load()
    const refresh = (event: Event) => {
      setChanged((event as CustomEvent<WindowsChanged | undefined>).detail ?? null)
      setVersion((value) => value + 1)
    }
    window.addEventListener('windows:changed', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('windows:changed', refresh)
    }
  }, [org, project, version])
  return {
    ...state,
    changed,
    reload: () => {
      setState({ loading: true, errors: [] })
      setVersion((value) => value + 1)
    }
  }
}
