export type DeviceOperatingSystem = 'macos' | 'linux' | 'windows' | 'unknown'

export interface CliDevice {
  name: string
  os: DeviceOperatingSystem
}

/** D36: parse only the CLI's versioned `skyclause-cli/{version} ({os}; {device name})` user agent. */
export function parseCliUserAgent(value: string | null | undefined): CliDevice {
  const match = value?.trim().match(/^skyclause-cli\/[^\s()]+ \((darwin|macos|linux|win32|windows); ([^()]+)\)$/i)
  if (!match) return { name: 'Unknown device', os: 'unknown' }

  const os = match[1]!.toLowerCase()
  const name = match[2]!.trim()
  if (!name) return { name: 'Unknown device', os: 'unknown' }

  return {
    name,
    os: os === 'darwin' || os === 'macos' ? 'macos' : os === 'win32' || os === 'windows' ? 'windows' : 'linux'
  }
}

export function normalizeDeviceCode(value: string) {
  return value.replaceAll('-', '').replaceAll(' ', '').toUpperCase()
}
