import { health } from '@skyclause/api'

export function GET() {
  return health()
}
