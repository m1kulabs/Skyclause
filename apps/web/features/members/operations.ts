import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const listMembers = REGISTRY.find((route) => route.operationId === 'listMembers')!
const updateMember = REGISTRY.find((route) => route.operationId === 'updateMember')!
const removeMember = REGISTRY.find((route) => route.operationId === 'removeMember')!
const listInvitations = REGISTRY.find((route) => route.operationId === 'listInvitations')!
const createInvitation = REGISTRY.find((route) => route.operationId === 'createInvitation')!
const revokeInvitation = REGISTRY.find((route) => route.operationId === 'revokeInvitation')!
const resendInvitation = REGISTRY.find((route) => route.operationId === 'resendInvitation')!
const createOwnershipTransfer = REGISTRY.find((route) => route.operationId === 'createOwnershipTransfer')!
const cancelOwnershipTransfer = REGISTRY.find((route) => route.operationId === 'cancelOwnershipTransfer')!
const inspectMemberToken = REGISTRY.find((route) => route.operationId === 'inspectMemberToken')!
const acceptInvitation = REGISTRY.find((route) => route.operationId === 'acceptInvitation')!
const acceptOwnershipTransfer = REGISTRY.find((route) => route.operationId === 'acceptOwnershipTransfer')!
const getRota = REGISTRY.find((route) => route.operationId === 'getRota')!
const replaceRotaShifts = REGISTRY.find((route) => route.operationId === 'replaceRotaShifts')!
const noContent = { parse: (_value: unknown): void => undefined }

export const membersOperations = {
  listMembers: {
    method: listMembers.method.toUpperCase(),
    path: listMembers.path,
    request: { params: listMembers.request.params, query: listMembers.request.query },
    response: listMembers.responses[200].content['application/json'].schema
  },
  updateMember: {
    method: updateMember.method.toUpperCase(),
    path: updateMember.path,
    request: {
      params: updateMember.request.params,
      body: updateMember.request.body.content['application/json'].schema
    },
    response: updateMember.responses[200].content['application/json'].schema
  },
  removeMember: {
    method: removeMember.method.toUpperCase(),
    path: removeMember.path,
    request: { params: removeMember.request.params },
    response: noContent
  },
  listInvitations: {
    method: listInvitations.method.toUpperCase(),
    path: listInvitations.path,
    request: { params: listInvitations.request.params, query: listInvitations.request.query },
    response: listInvitations.responses[200].content['application/json'].schema
  },
  createInvitation: {
    method: createInvitation.method.toUpperCase(),
    path: createInvitation.path,
    idempotent: true,
    request: {
      params: createInvitation.request.params,
      body: createInvitation.request.body.content['application/json'].schema
    },
    response: createInvitation.responses[201].content['application/json'].schema
  },
  revokeInvitation: {
    method: revokeInvitation.method.toUpperCase(),
    path: revokeInvitation.path,
    request: { params: revokeInvitation.request.params },
    response: noContent
  },
  resendInvitation: {
    method: resendInvitation.method.toUpperCase(),
    path: resendInvitation.path,
    request: { params: resendInvitation.request.params },
    response: resendInvitation.responses[200].content['application/json'].schema
  },
  createOwnershipTransfer: {
    method: createOwnershipTransfer.method.toUpperCase(),
    path: createOwnershipTransfer.path,
    idempotent: true,
    request: {
      params: createOwnershipTransfer.request.params,
      body: createOwnershipTransfer.request.body.content['application/json'].schema
    },
    response: createOwnershipTransfer.responses[201].content['application/json'].schema
  },
  cancelOwnershipTransfer: {
    method: cancelOwnershipTransfer.method.toUpperCase(),
    path: cancelOwnershipTransfer.path,
    request: { params: cancelOwnershipTransfer.request.params },
    response: noContent
  },
  inspectMemberToken: {
    method: inspectMemberToken.method.toUpperCase(),
    path: inspectMemberToken.path,
    request: { params: inspectMemberToken.request.params },
    response: inspectMemberToken.responses[200].content['application/json'].schema.passthrough()
  },
  acceptInvitation: {
    method: acceptInvitation.method.toUpperCase(),
    path: acceptInvitation.path,
    request: { params: acceptInvitation.request.params },
    response: acceptInvitation.responses[201].content['application/json'].schema
  },
  acceptOwnershipTransfer: {
    method: acceptOwnershipTransfer.method.toUpperCase(),
    path: acceptOwnershipTransfer.path,
    request: { params: acceptOwnershipTransfer.request.params },
    response: acceptOwnershipTransfer.responses[200].content['application/json'].schema
  },
  getRota: {
    method: getRota.method.toUpperCase(),
    path: getRota.path,
    request: { params: getRota.request.params, query: getRota.request.query },
    response: getRota.responses[200].content['application/json'].schema
  },
  replaceRotaShifts: {
    method: replaceRotaShifts.method.toUpperCase(),
    path: replaceRotaShifts.path,
    idempotent: true,
    request: {
      params: replaceRotaShifts.request.params,
      body: replaceRotaShifts.request.body.content['application/json'].schema
    },
    response: replaceRotaShifts.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(membersOperations)

export const inviteOperations = {
  inspectMemberToken: membersOperations.inspectMemberToken,
  acceptInvitation: membersOperations.acceptInvitation,
  acceptOwnershipTransfer: membersOperations.acceptOwnershipTransfer
}
export const inviteApiFetch = createApiFetch(inviteOperations, { organization: false })
