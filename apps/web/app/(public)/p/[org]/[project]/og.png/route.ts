import { projectOg } from '../../../../../../features/share-previews/routes'

export async function GET(request: Request, { params }: { params: Promise<{ org: string; project: string }> }) {
  return projectOg(request, await params)
}
