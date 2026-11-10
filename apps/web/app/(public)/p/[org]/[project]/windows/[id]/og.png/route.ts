import { windowOg } from '../../../../../../../../features/share-previews/routes'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; project: string; id: string }> }
) {
  return windowOg(request, await params)
}
