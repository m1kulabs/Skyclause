import { handleAnalyticsIngest, productionDeps } from '@skyclause/api'

// #111's `POST /e` on the marketing host (spec §4 Hosts; same origin in HOST_MODE=single). Never pass Next's second
// argument on: the handler takes no principal by design, so even a session cookie is ignored.
const handle = (request: Request) => handleAnalyticsIngest(request, productionDeps)

export { handle as OPTIONS, handle as POST }
