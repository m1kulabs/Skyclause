import { listCatalogueSources as catalogue } from '@skyclause/contracts/api/v1/catalogue'
import { createDevice as device } from '@skyclause/contracts/api/v1/devices'
import { updateProjectPack as pack } from '@skyclause/contracts/api/v1/packs'
import {
  bindSource as bind,
  listProjectSources as projectSources,
  unbindSource as unbind
} from '@skyclause/contracts/api/v1/sources'
import { createApiFetch } from '../../lib/api-fetch'

export const sourceOperations = {
  listCatalogueSources: {
    method: catalogue.method.toUpperCase(),
    path: catalogue.path,
    request: { query: catalogue.request.query },
    response: catalogue.responses[200].content['application/json'].schema
  },
  listProjectSources: {
    method: projectSources.method.toUpperCase(),
    path: projectSources.path,
    request: { params: projectSources.request.params, query: projectSources.request.query },
    response: projectSources.responses[200].content['application/json'].schema
  },
  bindSource: {
    method: bind.method.toUpperCase(),
    path: bind.path,
    idempotent: bind['x-skyclause'].idempotent,
    request: { params: bind.request.params, body: bind.request.body.content['application/json'].schema },
    response: bind.responses[201].content['application/json'].schema
  },
  unbindSource: {
    method: unbind.method.toUpperCase(),
    path: unbind.path,
    request: { params: unbind.request.params },
    response: { parse: (_value: unknown) => undefined }
  },
  updateProjectPack: {
    method: pack.method.toUpperCase(),
    path: pack.path,
    request: { params: pack.request.params, body: pack.request.body.content['application/json'].schema },
    response: pack.responses[200].content['application/json'].schema
  },
  createDevice: {
    method: device.method.toUpperCase(),
    path: device.path,
    idempotent: device['x-skyclause'].idempotent,
    request: { params: device.request.params, body: device.request.body.content['application/json'].schema },
    response: device.responses[201].content['application/json'].schema
  }
}

export const sourcesApi = createApiFetch(sourceOperations)
export type CatalogueSourceView = ReturnType<
  typeof sourceOperations.listCatalogueSources.response.parse
>['data'][number]
export type BoundSourceView = ReturnType<typeof sourceOperations.listProjectSources.response.parse>['data'][number]
