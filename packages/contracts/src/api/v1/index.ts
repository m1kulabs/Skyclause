import { routes as analysisRoutes } from './analysis'
import { routes as bundlesRoutes } from './bundles'
import { routes as callsRoutes } from './calls'
import { routes as catalogueRoutes } from './catalogue'
import { routes as channelsRoutes } from './channels'
import { routes as clauseSheetsRoutes } from './clause-sheets'
import { routes as commonsRoutes } from './commons'
import { routes as dashboardRoutes } from './dashboard'
import { routes as daysRoutes } from './days'
import { routes as devicesRoutes } from './devices'
import { routes as eventsRoutes } from './events'
import { routes as evidenceRequestsRoutes } from './evidence-requests'
import { routes as gradesRoutes } from './grades'
import { routes as icsFeedsRoutes } from './ics-feeds'
import { routes as indicatorsRoutes } from './indicators'
import { routes as ingestRoutes } from './ingest'
import { routes as ledgerRoutes } from './ledger'
import { routes as listingsRoutes } from './listings'
import { routes as meRoutes } from './me'
import { routes as nightsRoutes } from './nights'
import { routes as packsRoutes } from './packs'
import { routes as pilotArchiveRoutes } from './pilot-archive'
import { routes as projectsRoutes } from './projects'
import { routes as publicRoutes } from './public'
import { routes as readingsRoutes } from './readings'
import { routes as replaysRoutes } from './replays'
import { routes as reviewItemsRoutes } from './review-items'
import { routes as runsRoutes } from './runs'
import { routes as sandboxRoutes } from './sandbox'
import { routes as searchRoutes } from './search'
import { routes as sourcesRoutes } from './sources'
import { routes as stripRoutes } from './strip'
import { routes as subscribeLinkRoutes } from './subscribe-link'
import { routes as subscriberCountsRoutes } from './subscriber-counts'
import { routes as subscribersRoutes } from './subscribers'
import { routes as usageRoutes } from './usage'
import { routes as verdictsRoutes } from './verdicts'
import { routes as webhooksRoutes } from './webhooks'
import { routes as windowsRoutes } from './windows'

export const V1_ROUTES = [
  ...analysisRoutes,
  ...bundlesRoutes,
  ...callsRoutes,
  ...catalogueRoutes,
  ...channelsRoutes,
  ...clauseSheetsRoutes,
  ...commonsRoutes,
  ...dashboardRoutes,
  ...daysRoutes,
  ...devicesRoutes,
  ...eventsRoutes,
  ...evidenceRequestsRoutes,
  ...gradesRoutes,
  ...icsFeedsRoutes,
  ...indicatorsRoutes,
  ...ingestRoutes,
  ...ledgerRoutes,
  ...listingsRoutes,
  ...meRoutes,
  ...nightsRoutes,
  ...packsRoutes,
  ...pilotArchiveRoutes,
  ...projectsRoutes,
  ...publicRoutes,
  ...readingsRoutes,
  ...replaysRoutes,
  ...reviewItemsRoutes,
  ...runsRoutes,
  ...sandboxRoutes,
  ...searchRoutes,
  ...sourcesRoutes,
  ...stripRoutes,
  ...subscribeLinkRoutes,
  ...subscriberCountsRoutes,
  ...subscribersRoutes,
  ...usageRoutes,
  ...verdictsRoutes,
  ...webhooksRoutes,
  ...windowsRoutes
] as const
