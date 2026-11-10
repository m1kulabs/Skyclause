import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const getSubscription = REGISTRY.find((route) => route.operationId === 'getSubscription')!
const createSubscription = REGISTRY.find((route) => route.operationId === 'createSubscription')!
const updateSubscription = REGISTRY.find((route) => route.operationId === 'updateSubscription')!
const confirmSubscription = REGISTRY.find((route) => route.operationId === 'confirmSubscription')!
const unsubscribeSubscription = REGISTRY.find((route) => route.operationId === 'unsubscribeSubscription')!
const createSubscriberReply = REGISTRY.find((route) => route.operationId === 'createSubscriberReply')!
const createSubscriberFeedback = REGISTRY.find((route) => route.operationId === 'createSubscriberFeedback')!
const listSubscribers = REGISTRY.find((route) => route.operationId === 'listSubscribers')!
const createSubscriber = REGISTRY.find((route) => route.operationId === 'createSubscriber')!
const deleteSubscriber = REGISTRY.find((route) => route.operationId === 'deleteSubscriber')!
const createSubscribeLink = REGISTRY.find((route) => route.operationId === 'createSubscribeLink')!
const getSubscriberCounts = REGISTRY.find((route) => route.operationId === 'getSubscriberCounts')!
const listChannels = REGISTRY.find((route) => route.operationId === 'listChannels')!
const previewChannels = REGISTRY.find((route) => route.operationId === 'previewChannels')!
const updateChannel = REGISTRY.find((route) => route.operationId === 'updateChannel')!
const listProjects = REGISTRY.find((route) => route.operationId === 'listProjects')!

// Keep paths, input types and response validation with the operation registry.
export const subscriberOperations = {
  getSubscription: {
    method: getSubscription.method.toUpperCase(),
    path: getSubscription.path,
    request: { params: getSubscription.request.params },
    response: getSubscription.responses[200].content['application/json'].schema
  },
  createSubscription: {
    method: createSubscription.method.toUpperCase(),
    path: createSubscription.path,
    request: {
      params: createSubscription.request.params,
      body: createSubscription.request.body.content['application/json'].schema
    },
    idempotent: true,
    response: createSubscription.responses[202].content['application/json'].schema
  },
  updateSubscription: {
    method: updateSubscription.method.toUpperCase(),
    path: updateSubscription.path,
    request: {
      params: updateSubscription.request.params,
      body: updateSubscription.request.body.content['application/json'].schema
    },
    response: updateSubscription.responses[200].content['application/json'].schema
  },
  confirmSubscription: {
    method: confirmSubscription.method.toUpperCase(),
    path: confirmSubscription.path,
    request: { params: confirmSubscription.request.params },
    response: confirmSubscription.responses[200].content['application/json'].schema
  },
  unsubscribeSubscription: {
    method: unsubscribeSubscription.method.toUpperCase(),
    path: unsubscribeSubscription.path,
    request: { params: unsubscribeSubscription.request.params },
    response: { parse: (_value: unknown): undefined => undefined }
  },
  createSubscriberReply: {
    method: createSubscriberReply.method.toUpperCase(),
    path: createSubscriberReply.path,
    request: {
      params: createSubscriberReply.request.params,
      body: createSubscriberReply.request.body.content['application/json'].schema
    },
    idempotent: true,
    response: createSubscriberReply.responses[201].content['application/json'].schema
  },
  createSubscriberFeedback: {
    method: createSubscriberFeedback.method.toUpperCase(),
    path: createSubscriberFeedback.path,
    request: {
      params: createSubscriberFeedback.request.params,
      body: createSubscriberFeedback.request.body.content['application/json'].schema
    },
    idempotent: true,
    response: createSubscriberFeedback.responses[201].content['application/json'].schema
  },
  listSubscribers: {
    method: listSubscribers.method.toUpperCase(),
    path: listSubscribers.path,
    request: { params: listSubscribers.request.params, query: listSubscribers.request.query },
    response: listSubscribers.responses[200].content['application/json'].schema
  },
  createSubscriber: {
    method: createSubscriber.method.toUpperCase(),
    path: createSubscriber.path,
    request: {
      params: createSubscriber.request.params,
      body: createSubscriber.request.body.content['application/json'].schema
    },
    idempotent: true,
    response: createSubscriber.responses[201].content['application/json'].schema
  },
  deleteSubscriber: {
    method: deleteSubscriber.method.toUpperCase(),
    path: deleteSubscriber.path,
    request: { params: deleteSubscriber.request.params },
    response: { parse: (_value: unknown): undefined => undefined }
  },
  createSubscribeLink: {
    method: createSubscribeLink.method.toUpperCase(),
    path: createSubscribeLink.path,
    request: { params: createSubscribeLink.request.params },
    idempotent: true,
    response: createSubscribeLink.responses[201].content['application/json'].schema
  },
  getSubscriberCounts: {
    method: getSubscriberCounts.method.toUpperCase(),
    path: getSubscriberCounts.path,
    request: { params: getSubscriberCounts.request.params },
    response: getSubscriberCounts.responses[200].content['application/json'].schema
  },
  listChannels: {
    method: listChannels.method.toUpperCase(),
    path: listChannels.path,
    request: { params: listChannels.request.params },
    response: listChannels.responses[200].content['application/json'].schema
  },
  previewChannels: {
    method: previewChannels.method.toUpperCase(),
    path: previewChannels.path,
    request: { params: previewChannels.request.params, query: previewChannels.request.query },
    response: previewChannels.responses[200].content['application/json'].schema
  },
  updateChannel: {
    method: updateChannel.method.toUpperCase(),
    path: updateChannel.path,
    request: {
      params: updateChannel.request.params,
      body: updateChannel.request.body.content['application/json'].schema
    },
    response: updateChannel.responses[200].content['application/json'].schema
  },
  listProjects: {
    method: listProjects.method.toUpperCase(),
    path: listProjects.path,
    request: { query: listProjects.request.query },
    response: listProjects.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(subscriberOperations)
