import { problemType, v1, withPublicCors } from '@skyclause/api'
import { NotBuiltError } from '@skyclause/contracts'
import { projectFaviconSvg } from '@skyclause/elements'
import { callCard, projectCard, windowCard } from './card'
import { previewLocale } from './i18n'
import { oembedAnswer } from './oembed'
import { cardImage } from './og-card'
import { notFound, problem } from './problems'
import { ReadFailed, v1Reads, type PreviewReads } from './reads'
import { failingInputs, headline } from './state'

// d-share-previews' Route Handlers (spec §4 "Other"), behind thin files under `app/`.

export interface PreviewDeps {
  reads(request: Request): PreviewReads
  now(): Date
}

const productionDeps: PreviewDeps = { reads: (request) => v1Reads(v1, request), now: () => new Date() }

type ProjectParams = { org: string; project: string }
const MINUTE = 'public, max-age=60'

/**
 * A failed read is answered as it came, uncached: no fallback, cached copy or default (NFR-15). A seam still waiting
 * on its owner answers 501 `not-built`, as an unbuilt API operation does.
 */
function handler<P>(fn: (request: Request, params: P, deps: PreviewDeps) => Promise<Response>) {
  return async (request: Request, params: P, deps: PreviewDeps = productionDeps): Promise<Response> => {
    try {
      return await fn(request, params, deps)
    } catch (error) {
      if (error instanceof NotBuiltError) return problem(501, problemType('not-built'), 'Not built', error.message)
      if (!(error instanceof ReadFailed)) throw error
      const headers = new Headers(error.response.headers)
      headers.set('Cache-Control', 'no-store')
      return new Response(error.response.body, { status: error.response.status, headers })
    }
  }
}

const matches = (ifNoneMatch: string | null, etag: string) =>
  (ifNoneMatch ?? '').split(',').some((tag) => ['*', etag].includes(tag.trim().replace(/^W\//, '')))

/** WEB-3 and TRD "Favicons and the live favicon": request time, 60 s, revalidated by `state_version`. */
export const favicon = handler<ProjectParams>(async (request, { org, project }, { reads }) => {
  const state = await reads(request).projectStatus(org, project)
  if (!state) return notFound()
  const headers = { 'Cache-Control': MINUTE, ETag: `"${state.state_version}"` }
  if (matches(request.headers.get('If-None-Match'), headers.ETag)) return new Response(null, { status: 304, headers })
  // `projectFaviconSvg` (#171) draws modes only, so a Storm watch alone keeps the plain mark.
  const svg = projectFaviconSvg({
    mode: headline(state.packs.filter((pack) => pack.mode !== null))?.mode ?? null,
    error: failingInputs(state.packs).length > 0
  })
  return new Response(svg, { headers: { ...headers, 'Content-Type': 'image/svg+xml' } })
})

/** WEB-4: the project card, from the headline pack's approved call in force. */
export const projectOg = handler<ProjectParams>(async (request, { org, project }, { reads, now }) => {
  const locale = previewLocale(request)
  const read = reads(request)
  const state = await read.projectStatus(org, project)
  if (!state) return notFound()
  const callId = headline(state.packs)?.call_id
  return cardImage(projectCard(state, callId ? await read.call(callId) : null, now(), locale), MINUTE, locale)
})

/** WEB-4 and D33: only an approved call on a public project has a card; a sent one never changes again. */
export const callOg = handler<{ callId: string }>(async (request, { callId }, { reads }) => {
  const locale = previewLocale(request)
  const call = await reads(request).call(callId)
  if (!call) return notFound()
  return cardImage(
    callCard(call, locale),
    call.state === 'sent' ? 'public, max-age=31536000, immutable' : MINUTE,
    locale
  )
})

/**
 * WEB-4 and D32: a public, non-guest window, untitled. `getPublicWindow` doesn't carry the window's project, so a public
 * window under another public project's path isn't told apart yet.
 */
export const windowOg = handler<ProjectParams & { id: string }>(async (request, { org, project, id }, { reads }) => {
  const locale = previewLocale(request)
  const read = reads(request)
  const [state, window] = await Promise.all([read.projectStatus(org, project), read.window(id)])
  if (!state || !window) return notFound()
  return cardImage(windowCard(state, window, await read.call(window.call_id), locale), MINUTE, locale)
})

const oembedAnswered = handler<null>((request, _params, { reads }) => oembedAnswer(request, reads(request)))

/** WEB-5: `/oembed`, with CORS `*` on every answer (spec §4). */
export const oembed = async (request: Request, deps?: PreviewDeps) =>
  withPublicCors(await oembedAnswered(request, null, deps))
