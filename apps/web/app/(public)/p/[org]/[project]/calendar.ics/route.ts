import { serveCalendarFeed } from '@skyclause/api'

// #154 c-ics-feed: the conditions calendar (spec §4 "Other", public), served by packages/api.
type Context = { params: Promise<{ org: string; project: string }> }

async function handle(request: Request, { params }: Context) {
  return serveCalendarFeed(request, await params)
}

export { handle as GET, handle as HEAD }
