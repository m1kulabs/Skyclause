import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const organisationExports = REGISTRY.find((route) => route.operationId === 'listOrganisationExports')!
const createOrganisationExport = REGISTRY.find((route) => route.operationId === 'createOrganisationExport')!
const getOrganisationDeletion = REGISTRY.find((route) => route.operationId === 'getOrganisationDeletion')!
const requestOrganisationDeletion = REGISTRY.find((route) => route.operationId === 'requestOrganisationDeletion')!
const cancelOrganisationDeletion = REGISTRY.find((route) => route.operationId === 'cancelOrganisationDeletion')!
const accountExports = REGISTRY.find((route) => route.operationId === 'listMyExports')!
const createAccountExport = REGISTRY.find((route) => route.operationId === 'createMyExport')!
const deleteAccount = REGISTRY.find((route) => route.operationId === 'deleteMyAccount')!
const memberships = REGISTRY.find((route) => route.operationId === 'listMyMemberships')!

export const dataOperations = {
  listOrganisationExports: {
    method: organisationExports.method.toUpperCase(),
    path: organisationExports.path,
    request: { params: organisationExports.request.params, query: organisationExports.request.query },
    response: organisationExports.responses[200].content['application/json'].schema
  },
  createOrganisationExport: {
    method: createOrganisationExport.method.toUpperCase(),
    path: createOrganisationExport.path,
    idempotent: true,
    request: {
      params: createOrganisationExport.request.params,
      body: createOrganisationExport.request.body.content['application/json'].schema
    },
    response: createOrganisationExport.responses[202].content['application/json'].schema
  },
  getOrganisationDeletion: {
    method: getOrganisationDeletion.method.toUpperCase(),
    path: getOrganisationDeletion.path,
    request: { params: getOrganisationDeletion.request.params },
    response: getOrganisationDeletion.responses[200].content['application/json'].schema
  },
  requestOrganisationDeletion: {
    method: requestOrganisationDeletion.method.toUpperCase(),
    path: requestOrganisationDeletion.path,
    request: {
      params: requestOrganisationDeletion.request.params,
      body: requestOrganisationDeletion.request.body.content['application/json'].schema
    },
    response: requestOrganisationDeletion.responses[202].content['application/json'].schema
  },
  cancelOrganisationDeletion: {
    method: cancelOrganisationDeletion.method.toUpperCase(),
    path: cancelOrganisationDeletion.path,
    request: { params: cancelOrganisationDeletion.request.params },
    response: cancelOrganisationDeletion.responses[200].content['application/json'].schema
  },
  listMyExports: {
    method: accountExports.method.toUpperCase(),
    path: accountExports.path,
    request: { query: accountExports.request.query },
    response: accountExports.responses[200].content['application/json'].schema
  },
  createMyExport: {
    method: createAccountExport.method.toUpperCase(),
    path: createAccountExport.path,
    idempotent: true,
    request: { body: createAccountExport.request.body.content['application/json'].schema },
    response: createAccountExport.responses[202].content['application/json'].schema
  },
  deleteMyAccount: {
    method: deleteAccount.method.toUpperCase(),
    path: deleteAccount.path,
    request: { body: deleteAccount.request.body.content['application/json'].schema },
    response: deleteAccount.responses[202].content['application/json'].schema
  },
  listMyMemberships: {
    method: memberships.method.toUpperCase(),
    path: memberships.path,
    request: { query: memberships.request.query },
    response: memberships.responses[200].content['application/json'].schema
  }
}

export const organisationApiFetch = createApiFetch(dataOperations)
export const accountApiFetch = createApiFetch(dataOperations, { organization: false })
export type OrganisationExport = ReturnType<
  typeof dataOperations.listOrganisationExports.response.parse
>['data'][number]
export type AccountExport = ReturnType<typeof dataOperations.listMyExports.response.parse>['data'][number]
export type DeletionState = ReturnType<typeof dataOperations.getOrganisationDeletion.response.parse>
