import { openApiResponse } from '@skyclause/api'

// TRD "API conventions": the committed packages/api/openapi.json, generated from the same route schemas.
export function GET() {
  return openApiResponse()
}
