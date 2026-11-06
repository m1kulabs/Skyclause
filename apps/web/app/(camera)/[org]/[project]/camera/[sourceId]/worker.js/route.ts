import { cameraPath, type CameraParams } from '../../../../../../../features/camera/route'
import { cameraWorker } from '../../../../../../../features/camera/offline'

export async function GET(_request: Request, { params }: { params: Promise<CameraParams> }) {
  const path = cameraPath(await params)
  return new Response(cameraWorker(path), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': path
    }
  })
}
