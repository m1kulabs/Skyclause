import { favicon } from '../../../../../../features/share-previews/routes'

export async function GET(request: Request, { params }: { params: Promise<{ org: string; project: string }> }) {
  return favicon(request, await params)
}
