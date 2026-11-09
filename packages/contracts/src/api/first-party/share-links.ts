import { listShareLinks } from './share-links/listShareLinks'
import { createShareLink } from './share-links/createShareLink'
import { revokeShareLink } from './share-links/revokeShareLink'

export { listShareLinks } from './share-links/listShareLinks'
export { createShareLink } from './share-links/createShareLink'
export { revokeShareLink } from './share-links/revokeShareLink'

export const routes = [listShareLinks, createShareLink, revokeShareLink] as const
