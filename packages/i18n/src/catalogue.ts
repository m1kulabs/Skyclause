import enShell from '../catalogue/en/shell.json' with { type: 'json' }
import msShell from '../catalogue/ms/shell.json' with { type: 'json' }
import enFormat from '../catalogue/en/format.json' with { type: 'json' }
import msFormat from '../catalogue/ms/format.json' with { type: 'json' }
import enMarketing from '../catalogue/en/marketing.json' with { type: 'json' }
import msMarketing from '../catalogue/ms/marketing.json' with { type: 'json' }

interface Catalogue {
  [key: string]: string | Catalogue
}

// Explicit imports work in Next, Bun and Vitest and keep filesystem access out of client bundles.
export const catalogueFiles: Record<string, { default: unknown }> = {
  '../catalogue/en/shell.json': { default: enShell },
  '../catalogue/ms/shell.json': { default: msShell },
  '../catalogue/en/format.json': { default: enFormat },
  '../catalogue/ms/format.json': { default: msFormat },
  '../catalogue/en/marketing.json': { default: enMarketing },
  '../catalogue/ms/marketing.json': { default: msMarketing }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function catalogueFor(locale: 'en' | 'ms', feature: string): Catalogue | undefined {
  const loaded = catalogueFiles[`../catalogue/${locale}/${feature}.json`]
  const value = isRecord(loaded) && 'default' in loaded ? loaded.default : loaded

  return isRecord(value) ? (value as Catalogue) : undefined
}

export function messageAt(root: Catalogue | undefined, path: string[]): string | undefined {
  let value: unknown = root

  for (const segment of path) {
    if (!isRecord(value)) return undefined
    value = value[segment]
  }

  return typeof value === 'string' ? value : undefined
}
