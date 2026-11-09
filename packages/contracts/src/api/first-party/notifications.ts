import { listNotifications } from './notifications/listNotifications'
import { streamNotifications } from './notifications/streamNotifications'
import { markNotificationRead } from './notifications/markNotificationRead'

export { listNotifications } from './notifications/listNotifications'
export { streamNotifications } from './notifications/streamNotifications'
export { markNotificationRead } from './notifications/markNotificationRead'

export const routes = [listNotifications, streamNotifications, markNotificationRead] as const
