import { listIcsFeeds } from './ics-feeds/listIcsFeeds'
import { createIcsFeed } from './ics-feeds/createIcsFeed'
import { deleteIcsFeed } from './ics-feeds/deleteIcsFeed'

export { listIcsFeeds } from './ics-feeds/listIcsFeeds'
export { createIcsFeed } from './ics-feeds/createIcsFeed'
export { deleteIcsFeed } from './ics-feeds/deleteIcsFeed'

export const routes = [listIcsFeeds, createIcsFeed, deleteIcsFeed] as const
