import { robotsTxt } from '../../features/share-previews/crawlers'

// Every host answers its own: the marketing host opens its public pages, every other host closes everything.
export function GET(request: Request) {
  return robotsTxt(request)
}
