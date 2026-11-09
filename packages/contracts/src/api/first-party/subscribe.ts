import { getSubscription } from './subscribe/getSubscription'
import { createSubscription } from './subscribe/createSubscription'
import { updateSubscription } from './subscribe/updateSubscription'
import { confirmSubscription } from './subscribe/confirmSubscription'
import { unsubscribeSubscription } from './subscribe/unsubscribeSubscription'
import { createSubscriberReply } from './subscribe/createSubscriberReply'
import { createSubscriberFeedback } from './subscribe/createSubscriberFeedback'
import { getSubscriberData } from './subscribe/getSubscriberData'
import { updateSubscriberData } from './subscribe/updateSubscriberData'
import { eraseSubscriberData } from './subscribe/eraseSubscriberData'
import { exportSubscriberData } from './subscribe/exportSubscriberData'

export { getSubscription } from './subscribe/getSubscription'
export { createSubscription } from './subscribe/createSubscription'
export { updateSubscription } from './subscribe/updateSubscription'
export { confirmSubscription } from './subscribe/confirmSubscription'
export { unsubscribeSubscription } from './subscribe/unsubscribeSubscription'
export { createSubscriberReply } from './subscribe/createSubscriberReply'
export { createSubscriberFeedback } from './subscribe/createSubscriberFeedback'
export { getSubscriberData } from './subscribe/getSubscriberData'
export { updateSubscriberData } from './subscribe/updateSubscriberData'
export { eraseSubscriberData } from './subscribe/eraseSubscriberData'
export { exportSubscriberData } from './subscribe/exportSubscriberData'

export const routes = [
  getSubscription,
  createSubscription,
  updateSubscription,
  confirmSubscription,
  unsubscribeSubscription,
  createSubscriberReply,
  createSubscriberFeedback,
  getSubscriberData,
  updateSubscriberData,
  eraseSubscriberData,
  exportSubscriberData
] as const
