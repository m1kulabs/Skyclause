import type { CallView } from '@skyclause/contracts'

export interface CallRowProps {
  call: CallView
}

export function CallRow(_props: CallRowProps) {
  return <tr data-unbuilt="d-data-components" />
}
