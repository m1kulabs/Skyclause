'use client'

import { useEffect, useState } from 'react'
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
interface LoadState {
  loading: boolean
  data?: WindowsData
  errors: string[]
}

export function useWindows(org: string, project: string) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<LoadState>({ loading: true, errors: [] })
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
        const [windows, feeds, days, nights, bundles] = results
        const keys = ['load_error', 'feeds_error', 'days_error', 'nights_error', 'bundles_error']
        const errors = results.flatMap((result, index) => (result.status === 'rejected' ? [keys[index]!] : []))
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
      } catch {
        if (!controller.signal.aborted) setState({ loading: false, errors: ['load_error'] })
      }
    }
    void load()
    const refresh = () => setVersion((value) => value + 1)
    window.addEventListener('windows:changed', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('windows:changed', refresh)
    }
  }, [org, project, version])
  return {
    ...state,
    reload: () => {
      setState({ loading: true, errors: [] })
      setVersion((value) => value + 1)
    }
  }
}
