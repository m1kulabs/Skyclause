'use client'

import { notBuilt } from '@skyclause/contracts/not-built'

export interface Reauth {
  requireReauth: () => Promise<void>
}

export const useReauth: () => Reauth = notBuilt('a-step-up')
