import { v1 } from '../../../lib/api'

// Every `/v1` operation (spec §4), served by packages/api. Never pass Next's second argument on: Hono would read it
// as the in-process principal binding (D5).
const handle = (request: Request) => v1.fetch(request)

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT
}
