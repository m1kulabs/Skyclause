// The device post contract from the #47 spec "Device posts", shared by the camera page, the Pi agent and the
// Apps Script router. Devices post `text/plain;charset=utf-8` with a JSON body to the web app's `/exec` URL.
export interface DevicePost {
  kind: string
  token: string
  device_id: string
  [field: string]: unknown
}

// What a handler receives: the post without its token.
export type PostBody = Omit<DevicePost, 'token'>

export type PostResult = { ok: true; duplicate: boolean } | { ok: false; error: string }
