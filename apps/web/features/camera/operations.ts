import { ingestReadings } from '../../../../packages/contracts/src/api/v1/ingest'
import { createApiFetch } from '../../lib/api-fetch'
import type { Frame } from './model'

export const cameraOperations = {
  ingestReadings: {
    method: ingestReadings.method.toUpperCase(),
    path: ingestReadings.path,
    request: {
      params: ingestReadings.request.params,
      body: ingestReadings.request.body.content['application/json'].schema
    },
    response: ingestReadings.responses[200].content['application/json'].schema,
    idempotent: true
  }
}

export function cameraTransport(sourceId: string, apiOrigin: string) {
  const apiFetch = createApiFetch(cameraOperations, { baseUrl: apiOrigin, organization: false })
  return (frame: Frame, token: string, signal?: AbortSignal) => {
    const { attempts: _attempts, jpeg, ...value } = frame
    return apiFetch('ingestReadings', {
      params: { sourceId },
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': frame.capture_id },
      credentials: 'omit',
      signal,
      body: { kind: 'camera_frame', ...value, jpeg_b64: jpeg.replace(/^data:image\/jpeg;base64,/, '') }
    })
  }
}
