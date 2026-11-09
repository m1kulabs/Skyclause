import { bindSource } from './sources/bindSource'
import { unbindSource } from './sources/unbindSource'
import { rotateDeviceToken } from './sources/rotateDeviceToken'
import { listProjectSources } from './sources/listProjectSources'
import { listSourceReadings } from './sources/listSourceReadings'
import { listSourcePolls } from './sources/listSourcePolls'

export { bindSource } from './sources/bindSource'
export { unbindSource } from './sources/unbindSource'
export { rotateDeviceToken } from './sources/rotateDeviceToken'
export { listProjectSources } from './sources/listProjectSources'
export { listSourceReadings } from './sources/listSourceReadings'
export { listSourcePolls } from './sources/listSourcePolls'

export const routes = [
  bindSource,
  unbindSource,
  rotateDeviceToken,
  listProjectSources,
  listSourceReadings,
  listSourcePolls
] as const
