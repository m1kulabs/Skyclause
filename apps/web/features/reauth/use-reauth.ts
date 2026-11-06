'use client'

import { notBuilt } from '@skyclause/contracts'

export interface Reauth {
  requireReauth: () => Promise<void>
}

export const useReauth: () => Reauth = notBuilt('a-step-up')
