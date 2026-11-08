import { problemType } from '@skyclause/api'
import { notBuilt, slugSchema } from '@skyclause/contracts'
import { t } from './i18n'
import { CARD_SIZE } from './og-card'
import { notFound, problem } from './problems'
import type { PreviewReads, PublicCall } from './reads'

// WEB-5, TRD "Open Graph and oEmbed" and DESIGN "oEmbed card": https://oembed.com/ 1.0, `rich`, JSON only.

const FRAME = { width: 480, height: 200 }
const CACHE_AGE = 60

interface Origins {
  marketing: string
  app: string
  embed: string
}

type Target = { kind: 'project'; org: string; project: string } | { kind: 'call'; callId: string } | { kind: 'member' }

/**
 * Spec §4 Hosts: under multi, the configured origins; under single, the one origin, taken from the URL when it names
 * this request's host, with the embed frames under `/embed/`.
 */
function originsFor(request: Request, url: URL): Origins | null {
  if (process.env.HOST_MODE === 'multi') {
    const origin = (name: string) => new URL(process.env[name]!).origin
    return { marketing: origin('MARKETING_ORIGIN'), app: origin('APP_ORIGIN'), embed: origin('EMBED_ORIGIN') }
  }
  const host = request.headers.get('host') ?? new URL(request.url).host
  return url.host === host ? { marketing: url.origin, app: url.origin, embed: `${url.origin}/embed` } : null
}

/**
 * `/p/{org}/{project}` (and its ledger) and `/c/{callId}` on the marketing origin. A project's member page is a
 * private resource by its shape alone, so 401 tells nothing about whether that project exists.
 */
function targetOf(url: URL, origins: Origins): Target | null {
  const [first, a, b, c, ...rest] = url.pathname.split('/').filter(Boolean)
  if (url.origin === origins.marketing) {
    if (first === 'p' && a && b && (c === undefined || (c === 'ledger' && !rest.length))) {
      return { kind: 'project', org: a, project: b }
    }
    if (first === 'c' && a && b === undefined) return { kind: 'call', callId: a }
  }
  if (url.origin === origins.app && a && slugSchema.safeParse(first).success) return { kind: 'member' }
  return null
}

/**
 * The call's window frame, `{embed}/window/{windowId}`: `getPublicCall` carries neither the call's window ID nor its
 * project yet (#187 may add both as optional fields), so a public call URL answers 501 here.
 */
const callEmbed: (call: PublicCall, o: { origins: Origins; width: number; height: number }) => Response =
  notBuilt('d-share-previews')

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A positive whole `maxwidth` or `maxheight`, Infinity when absent, NaN when malformed. */
function limit(value: string | null): number {
  if (value === null) return Infinity
  return /^[1-9]\d*$/.test(value) ? Number(value) : NaN
}

export async function oembedAnswer(request: Request, reads: PreviewReads): Promise<Response> {
  const query = new URL(request.url).searchParams
  if ((query.get('format') ?? 'json') !== 'json') {
    return problem(501, 'about:blank', 'Not Implemented', 'Only format=json is offered.')
  }
  const maxWidth = limit(query.get('maxwidth'))
  const maxHeight = limit(query.get('maxheight'))
  const url = URL.parse(query.get('url') ?? '')
  if (!url || Number.isNaN(maxWidth) || Number.isNaN(maxHeight)) {
    return problem(
      400,
      'about:blank',
      'Bad Request',
      'Send an absolute url, and positive whole maxwidth and maxheight.'
    )
  }
  const origins = originsFor(request, url)
  const target = origins && targetOf(url, origins)
  if (!origins || !target) return notFound()
  if (target.kind === 'member') {
    return problem(401, problemType('unauthenticated'), 'Unauthorized', "A project's member pages can't be embedded.")
  }

  const scale = Math.min(1, maxWidth / FRAME.width, maxHeight / FRAME.height)
  const width = Math.floor(FRAME.width * scale)
  const height = Math.floor(FRAME.height * scale)
  if (target.kind === 'call') {
    const call = await reads.call(target.callId)
    return call ? callEmbed(call, { origins, width, height }) : notFound()
  }

  const state = await reads.projectStatus(target.org, target.project)
  if (!state) return notFound()
  const { org_slug: org, slug: project } = state.project
  const title = t('share-previews.title', { brand: t('brand.name'), project })
  return Response.json(
    {
      version: '1.0',
      type: 'rich',
      provider_name: t('brand.name'),
      provider_url: `${origins.marketing}/`,
      cache_age: CACHE_AGE,
      width,
      height,
      html: `<iframe src="${origins.embed}/${org}/${project}" width="${width}" height="${height}" title="${escapeAttribute(title)}" sandbox="allow-scripts allow-popups" style="border:0" loading="lazy"></iframe>`,
      // oEmbed 1.0 §2.3.4: the thumbnail must respect maxwidth and maxheight, so a smaller limit leaves it out.
      ...(CARD_SIZE.width <= maxWidth && CARD_SIZE.height <= maxHeight
        ? {
            thumbnail_url: `${origins.marketing}/p/${org}/${project}/og.png`,
            thumbnail_width: CARD_SIZE.width,
            thumbnail_height: CARD_SIZE.height
          }
        : {})
    },
    { headers: { 'Cache-Control': `public, max-age=${CACHE_AGE}` } }
  )
}
