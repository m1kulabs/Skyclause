import { oembed } from '../../features/share-previews/routes'

export function GET(request: Request) {
  return oembed(request)
}
