import { getConnectConfig } from './connect/getConnectConfig'
import { listConnectVerifications } from './connect/listConnectVerifications'
import { listConnectActivity } from './connect/listConnectActivity'

export { getConnectConfig } from './connect/getConnectConfig'
export { listConnectVerifications } from './connect/listConnectVerifications'
export { listConnectActivity } from './connect/listConnectActivity'

export const routes = [getConnectConfig, listConnectVerifications, listConnectActivity] as const
