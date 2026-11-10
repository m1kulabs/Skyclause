import { authHandler } from '@skyclause/auth'

// cacheComponents prerenders a static path's GET at build time unless the handler reads the request first (as /oembed
// does), and authHandler loads the web environment before it reads the request, so the build failed without one.
// Rebuilding the request from its URL and headers reads it first: the metadata is per deployment, rendered per request.
export function GET(request: Request) {
  return authHandler(new Request(request.url, { headers: request.headers }))
}
