import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const list = REGISTRY.find((route) => route.operationId === 'listWebhooks')!
const create = REGISTRY.find((route) => route.operationId === 'createWebhook')!
const get = REGISTRY.find((route) => route.operationId === 'getWebhook')!
const verify = REGISTRY.find((route) => route.operationId === 'verifyWebhook')!
const redeliver = REGISTRY.find((route) => route.operationId === 'redeliverWebhook')!
const deliveries = REGISTRY.find((route) => route.operationId === 'listWebhookDeliveries')!
const remove = REGISTRY.find((route) => route.operationId === 'deleteWebhook')!
const projects = REGISTRY.find((route) => route.operationId === 'listProjects')!

export const webhookOperations = {
  listWebhooks: {
    method: list.method,
    path: list.path,
    request: { query: list.request.query },
    response: list.responses[200].content['application/json'].schema
  },
  createWebhook: {
    method: create.method,
    path: create.path,
    idempotent: true,
    request: { body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema
  },
  getWebhook: {
    method: get.method,
    path: get.path,
    request: { params: get.request.params },
    response: get.responses[200].content['application/json'].schema
  },
  verifyWebhook: {
    method: verify.method,
    path: verify.path,
    request: { params: verify.request.params },
    response: verify.responses[200].content['application/json'].schema
  },
  redeliverWebhook: {
    method: redeliver.method,
    path: redeliver.path,
    request: { params: redeliver.request.params },
    response: redeliver.responses[202].content['application/json'].schema
  },
  listWebhookDeliveries: {
    method: deliveries.method,
    path: deliveries.path,
    request: { params: deliveries.request.params, query: deliveries.request.query },
    response: deliveries.responses[200].content['application/json'].schema
  },
  deleteWebhook: {
    method: remove.method,
    path: remove.path,
    request: { params: remove.request.params },
    response: { parse: (_value: unknown): undefined => undefined }
  },
  listProjects: {
    method: projects.method,
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(webhookOperations)
export type Endpoint = ReturnType<typeof webhookOperations.getWebhook.response.parse>
export type Delivery = ReturnType<typeof webhookOperations.listWebhookDeliveries.response.parse>['data'][number]
export type WebhookProject = ReturnType<typeof webhookOperations.listProjects.response.parse>['data'][number]
