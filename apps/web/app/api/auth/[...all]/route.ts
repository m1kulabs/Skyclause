import { authHandler } from '@skyclause/auth'

// Better Auth's own endpoints (#79 §4's `/api/auth/*` base row), more specific than the `/api` catch-all.
const handle = (request: Request) => authHandler(request)

export { handle as GET, handle as POST }
