import { modeColours } from '@skyclause/elements'
import { cameraPath, type CameraParams } from '../../../../../../../features/camera/route'
import { t } from '../../../../../../../features/camera/i18n'

export async function GET(_request: Request, { params }: { params: Promise<CameraParams> }) {
  const path = cameraPath(await params)
  return Response.json(
    {
      id: path,
      name: t('camera.title'),
      short_name: t('camera.title'),
      start_url: path,
      scope: path,
      display: 'standalone',
      background_color: modeColours.dark.ground,
      theme_color: modeColours.dark.ground,
      lang: 'en'
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } }
  )
}
