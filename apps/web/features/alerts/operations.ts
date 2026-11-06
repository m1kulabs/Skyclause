import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const inbox = REGISTRY.find((r) => r.operationId === 'listNotifications')!
const read = REGISTRY.find((r) => r.operationId === 'markNotificationRead')!
const preferences = REGISTRY.find((r) => r.operationId === 'getMyNotificationPreferences')!
const save = REGISTRY.find((r) => r.operationId === 'updateMyNotificationPreferences')!
const devices = REGISTRY.find((r) => r.operationId === 'listPushSubscriptions')!
const create = REGISTRY.find((r) => r.operationId === 'createPushSubscription')!
const remove = REGISTRY.find((r) => r.operationId === 'deletePushSubscription')!
const vapid = REGISTRY.find((r) => r.operationId === 'getVapidPublicKey')!
const stream = REGISTRY.find((r) => r.operationId === 'streamNotifications')!
export const notificationStreamPath = REGISTRY.find((r) => r.operationId === 'streamNotifications')!.path

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
