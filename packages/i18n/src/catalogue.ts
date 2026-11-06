interface Catalogue {
  [key: string]: string | Catalogue
}

type GlobImportMeta = ImportMeta & {
  glob: <Module>(pattern: string, options: { eager: true }) => Record<string, Module>
}

export const catalogueFiles = (import.meta as GlobImportMeta).glob<unknown>('../catalogue/*/*.json', {
  eager: true
})

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
