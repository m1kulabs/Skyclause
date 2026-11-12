'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApiProblem } from '../../lib/api-fetch'
import { resolveProject } from '../calls/operations'
import { apiFetch, type BundleListItem } from './operations'
import { LIST_LIMIT } from './model'

export type BundleList =
  | { status: 'loading' }
  | { status: 'error'; code: number | null; at: string }
  | { status: 'ready'; rows: BundleListItem[]; more: boolean }

/**
 * The project's bundles, newest first, from `GET /v1/projects/{id}/bundles`; a refresh keeps the rows on screen. The
 * project comes from the open bundle; when that read failed, from the project's slug (`slug`).
 */
export function useProjectBundles(projectId: string | undefined, org: string, initial?: BundleList, slug?: string) {
  const [list, setList] = useState<BundleList>(initial ?? { status: 'loading' })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!projectId && !slug) return
    const controller = new AbortController()
    const id = projectId
      ? Promise.resolve(projectId)
      : resolveProject(org, slug!, controller.signal).then((project) => project.id)
    id.then((resolved) =>
      apiFetch('listProjectBundles', {
        org,
        params: { id: resolved },
        query: { limit: LIST_LIMIT },
        signal: controller.signal
      })
    )
      .then((page) => {
        if (!controller.signal.aborted)
          setList({ status: 'ready', rows: page.data.slice(0, LIST_LIMIT), more: Boolean(page.next_cursor) })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setList({
            status: 'error',
            code: error instanceof ApiProblem ? error.status : null,
            at: new Date().toISOString()
          })
      })
    return () => controller.abort()
  }, [projectId, slug, org, revision])

  const retry = useCallback(() => {
    setList({ status: 'loading' })
    setRevision((value) => value + 1)
  }, [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  return { list, retry, refresh }
}
