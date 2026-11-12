import { v1Bridge } from '../../../../lib/api'

// #737: the browser's `/v1` operations, on the app host where its host-only session cookie goes. `/api/v1/x` is
// served as `/v1/x` by the same handlers under `/api`'s rule: sessions only, a cookie write from APP_ORIGIN, no CORS.
// The request keeps its method, headers, body and abort signal. Never pass Next's second argument on: Hono would read
// it as the in-process principal binding (D5).
const handle = (request: Request) => {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice('/api'.length)
  return v1Bridge.fetch(new Request(url, request))
}

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT
}
