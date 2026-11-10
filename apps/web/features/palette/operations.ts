import { updateMyPreferences } from '@skyclause/contracts/api/first-party/me'
import { createApiFetch } from '../../lib/api-fetch'

const updatePreferences = {
  method: updateMyPreferences.method.toUpperCase(),
  path: updateMyPreferences.path,
  request: { body: updateMyPreferences.request.body.content['application/json'].schema },
  response: updateMyPreferences.responses[200].content['application/json'].schema
}

export const palettePreferencesApi = createApiFetch({ updateMyPreferences: updatePreferences }, { organization: false })
