import { notBuilt, type CallView, type TxHandle } from '@skyclause/contracts'

// #159's evidence packs list their calls as `CallView`s, which #150 (c-bundle-lifecycle) assembles from the call rows
// and the `notices` and `recipients` columns it adds.
export const evidenceCallViews: (tx: TxHandle, callIds: string[]) => Promise<CallView[]> =
  notBuilt('c-bundle-lifecycle')
