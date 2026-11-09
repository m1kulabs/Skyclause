import { callOg } from '../../../../../features/share-previews/routes'

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  return callOg(request, await params)
}
