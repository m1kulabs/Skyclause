import { getMyNotificationPreferences as preferences } from '@skyclause/contracts/api/first-party/me/getMyNotificationPreferences'
import { updateMyNotificationPreferences as save } from '@skyclause/contracts/api/first-party/me/updateMyNotificationPreferences'
import { listNotifications as inbox } from '@skyclause/contracts/api/first-party/notifications/listNotifications'
import { markNotificationRead as read } from '@skyclause/contracts/api/first-party/notifications/markNotificationRead'
import { streamNotifications as stream } from '@skyclause/contracts/api/first-party/notifications/streamNotifications'
import { getVapidPublicKey as vapid } from '@skyclause/contracts/api/first-party/push/getVapidPublicKey'
import { listPushSubscriptions as devices } from '@skyclause/contracts/api/first-party/push-subscriptions/listPushSubscriptions'
import { createPushSubscription as create } from '@skyclause/contracts/api/first-party/push-subscriptions/createPushSubscription'
import { deletePushSubscription as remove } from '@skyclause/contracts/api/first-party/push-subscriptions/deletePushSubscription'
import { createApiFetch } from '../../lib/api-fetch'

export const notificationStreamPath = stream.path

export const alertsOperations = {
  streamNotifications: {
    method: stream.method.toUpperCase(),
    path: stream.path,
    response: stream.responses[200].content['text/event-stream'].schema
  },
  listNotifications: {
    method: inbox.method.toUpperCase(),
    path: inbox.path,
    request: { query: inbox.request.query },
    response: inbox.responses[200].content['application/json'].schema
  },
  markNotificationRead: {
    method: read.method.toUpperCase(),
    path: read.path,
    request: { params: read.request.params },
    response: read.responses[200].content['application/json'].schema
  },
  getMyNotificationPreferences: {
    method: preferences.method.toUpperCase(),
    path: preferences.path,
    response: preferences.responses[200].content['application/json'].schema
  },
  updateMyNotificationPreferences: {
    method: save.method.toUpperCase(),
    path: save.path,
    request: { body: save.request.body.content['application/json'].schema },
    response: save.responses[200].content['application/json'].schema
  },
  listPushSubscriptions: {
    method: devices.method.toUpperCase(),
    path: devices.path,
    request: { query: devices.request.query },
    response: devices.responses[200].content['application/json'].schema
  },
  createPushSubscription: {
    method: create.method.toUpperCase(),
    path: create.path,
    idempotent: true,
    request: { body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema
  },
  deletePushSubscription: {
    method: remove.method.toUpperCase(),
    path: remove.path,
    request: { params: remove.request.params },
    response: { parse: (_value: unknown): void => undefined }
  },
  getVapidPublicKey: {
    method: vapid.method.toUpperCase(),
    path: vapid.path,
    response: vapid.responses[200].content['application/json'].schema
  }
}
export const apiFetch = createApiFetch(alertsOperations)
