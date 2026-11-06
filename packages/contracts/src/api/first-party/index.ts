import { routes as adminRoutes } from './admin'
import { routes as bundlesRoutes } from './bundles'
import { routes as callsRoutes } from './calls'
import { routes as clauseSheetsRoutes } from './clause-sheets'
import { routes as connectRoutes } from './connect'
import { routes as developersRoutes } from './developers'
import { routes as evidenceRequestsRoutes } from './evidence-requests'
import { routes as exportsRoutes } from './exports'
import { routes as guestRoutes } from './guest'
import { routes as inviteRoutes } from './invite'
import { routes as listingsRoutes } from './listings'
import { routes as meRoutes } from './me'
import { routes as notificationsRoutes } from './notifications'
import { routes as orgsRoutes } from './orgs'
import { routes as ownershipTransfersRoutes } from './ownership-transfers'
import { routes as projectsRoutes } from './projects'
import { routes as pushRoutes } from './push'
import { routes as pushSubscriptionsRoutes } from './push-subscriptions'
import { routes as shareRoutes } from './share'
import { routes as shareLinksRoutes } from './share-links'
import { routes as sourcesRoutes } from './sources'
import { routes as subscribeRoutes } from './subscribe'

export const API_ROUTES = [
  ...adminRoutes,
  ...bundlesRoutes,
  ...callsRoutes,
  ...clauseSheetsRoutes,
  ...connectRoutes,
  ...developersRoutes,
  ...evidenceRequestsRoutes,
  ...exportsRoutes,
  ...guestRoutes,
  ...inviteRoutes,
  ...listingsRoutes,
  ...meRoutes,
  ...notificationsRoutes,
  ...orgsRoutes,
  ...ownershipTransfersRoutes,
  ...projectsRoutes,
  ...pushRoutes,
  ...pushSubscriptionsRoutes,
  ...shareRoutes,
  ...shareLinksRoutes,
  ...sourcesRoutes,
  ...subscribeRoutes
] as const
