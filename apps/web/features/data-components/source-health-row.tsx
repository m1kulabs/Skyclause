import type { Source } from '@skyclause/contracts'

export interface SourceHealthRowProps {
  source: Source
}

export function SourceHealthRow(_props: SourceHealthRowProps) {
  return <tr data-unbuilt="d-data-components" />
}
