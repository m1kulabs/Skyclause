import { cameraDrive, cameraFrameStore, getProperty, piRowsStore } from './gas.ts'
import { handlePiRows, PI_ROWS_KIND } from './pi-rows.ts'
import { newUuidV7 } from './jps.ts'
import { CAMERA_CONFIG_KIND, CAMERA_FRAME_KIND, cameraConfig, handleCameraFrame } from './camera.ts'
import type { GetRoute, PostRoute } from './router.ts'

// Feature tickets register their web app handlers here, one line each.
export const postRoutes: PostRoute[] = [
  {
    kind: PI_ROWS_KIND,
    tokenProperty: 'PI_TOKEN',
    handle: (body) => handlePiRows(body, piRowsStore(getProperty('SHEET_ID') ?? ''), new Date())
  },
  {
    kind: CAMERA_FRAME_KIND,
    tokenProperty: 'CAMERA_TOKEN',
    handle: (body) =>
      handleCameraFrame(body, cameraFrameStore(getProperty('SHEET_ID') ?? ''), cameraDrive, {
        now: () => new Date(),
        newPollId: () => newUuidV7(),
        dayStart: getProperty('CAMERA_DAY_START'),
        dayEnd: getProperty('CAMERA_DAY_END'),
        framesRootId: getProperty('FRAMES_FOLDER_ID') ?? ''
      })
  }
]

export const getRoutes: GetRoute[] = [
  {
    param: 'kind',
    value: CAMERA_CONFIG_KIND,
    handle: () => ({ json: cameraConfig(getProperty('CAMERA_DAY_START'), getProperty('CAMERA_DAY_END')) })
  }
]
