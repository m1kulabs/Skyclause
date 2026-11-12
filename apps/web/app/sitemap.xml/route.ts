import { sitemapXml } from '../../features/share-previews/crawlers'

// The marketing host's public pages (features/share-previews/crawlers.ts).
export function GET() {
  return sitemapXml()
}
