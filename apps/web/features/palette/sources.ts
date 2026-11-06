import type { Role } from '@skyclause/contracts'

export interface PaletteItem {
  id: string
  /** A translated label supplied by the source. */
  label: string
  keywords?: string[]
  onSelect: () => void
}

export interface PaletteSource {
  id: string
  roles: readonly Role[]
  items: readonly PaletteItem[]
}

// #176 and domain owners append one imported source per line here (spec §7).
export const paletteSources: readonly PaletteSource[] = []

export function sourcesForRole(sources: readonly PaletteSource[], role: Role | null): PaletteSource[] {
  return role === null ? [] : sources.filter((source) => source.roles.includes(role))
}
