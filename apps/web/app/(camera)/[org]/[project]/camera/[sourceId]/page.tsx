import { Camera } from '../../../../../../features/camera/camera'
import { cameraPath, type CameraParams } from '../../../../../../features/camera/route'
import { t } from '../../../../../../features/camera/i18n'

export async function generateMetadata({ params }: { params: Promise<CameraParams> }) {
  return { title: t('camera.title'), manifest: `${cameraPath(await params)}/manifest.webmanifest` }
}

export default async function Page({ params }: { params: Promise<CameraParams> }) {
  const values = await params
  const apiOrigin = process.env.HOST_MODE === 'multi' ? process.env.API_ORIGIN : ''
  // HOST_MODE=multi requires API_ORIGIN; fail visibly instead of sending the token to the wrong host.
  if (apiOrigin === undefined) throw new Error('API_ORIGIN is required for the camera in multi-host mode')
  return <Camera path={cameraPath(values)} sourceId={values.sourceId} apiOrigin={apiOrigin} />
}
