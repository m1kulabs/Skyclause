import { pageOg } from '../../features/share-previews/page-card'

// The share card of the landing, the legal pages and sign-in, on the marketing host (features/share-previews/page-card.ts).
export function GET(request: Request) {
  return pageOg(request)
}
