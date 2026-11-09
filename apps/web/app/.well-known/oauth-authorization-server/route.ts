import { authHandler } from '@skyclause/auth'

export function GET(request: Request) {
  return authHandler(request)
}
