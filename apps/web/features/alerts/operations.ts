import {
  getMyNotificationPreferences as preferences,
  updateMyNotificationPreferences as save
} from '@skyclause/contracts/api/first-party/me'
import {
  listNotifications as inbox,
  markNotificationRead as read,
  streamNotifications as stream
} from '@skyclause/contracts/api/first-party/notifications'
import { getVapidPublicKey as vapid } from '@skyclause/contracts/api/first-party/push'
import {
  listPushSubscriptions as devices,
  createPushSubscription as create,
  deletePushSubscription as remove
} from '@skyclause/contracts/api/first-party/push-subscriptions'
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
