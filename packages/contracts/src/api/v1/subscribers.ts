import { listSubscribers } from './subscribers/listSubscribers'
import { createSubscriber } from './subscribers/createSubscriber'
import { deleteSubscriber } from './subscribers/deleteSubscriber'

export { listSubscribers } from './subscribers/listSubscribers'
export { createSubscriber } from './subscribers/createSubscriber'
export { deleteSubscriber } from './subscribers/deleteSubscriber'

export const routes = [listSubscribers, createSubscriber, deleteSubscriber] as const
