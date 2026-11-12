import { connection } from 'next/server'
import { hostConfig, pagesOf } from '../../lib/hosts'
import { originOf } from '../../lib/origins'

// What search crawlers may read: the marketing host's public pages, listed in its sitemap. The app host's pages are a
// member's, and the API, MCP, embed and docs hosts have no page to index.

const text = (body: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  })

/**
 * `/robots.txt`, by the host asked (compared with the configured hosts, never used to build a URL). On one host
 * (HOST_MODE=single) that host is the marketing host too.
 */
export function robotsTxt(request: Request): Response {
  const config = hostConfig(process.env)
  const host = (request.headers.get('host') ?? new URL(request.url).host).toLowerCase()
  if (config.mode === 'multi' && config.hosts.marketing !== host) return text('User-agent: *\nDisallow: /\n')
  // The app's pages outside an organisation, by their first segment; an organisation's are on the app host.
  const appRoots = [
    ...new Set(
      pagesOf('app')
        .map((page) => page.split('/')[1]!)
        .filter((segment) => !segment.startsWith(':'))
    )
  ]
  const marketing = originOf('marketing')
  return text(
    [
      'User-agent: *',
      'Allow: /',
      ...['api', 'v1', 'mcp', ...appRoots].map((root) => `Disallow: /${root}`),
      ...(marketing ? [`Sitemap: ${new URL('/sitemap.xml', marketing)}`] : []),
      ''
    ].join('\n')
  )
}

/** `/sitemap.xml` on the marketing host: its public pages, each at its absolute URL. */
export async function sitemapXml(): Promise<Response> {
  await connection()
  const marketing = originOf('marketing')
  if (!marketing) return new Response(null, { status: 404 })
  const urls = pagesOf('marketing').map((page) => `  <url><loc>${new URL(page, marketing)}</loc></url>`)
  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
      ''
    ].join('\n'),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }
  )
}
