import { api } from '@skyclause/api'

// Every first-party `/api` operation (spec §4), served by packages/api; Better Auth's `/api/auth/*` is its own,
// more specific route (#94). Never pass Next's second argument on: Hono would read it as the principal binding.
const handle = (request: Request) => api.fetch(request)

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT
}
