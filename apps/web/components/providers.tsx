'use client'

import type { ReactNode } from 'react'
import { TooltipProvider } from '#ui/tooltip'
import { Toaster } from '#ui/toast'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <Toaster>{children}</Toaster>
    </TooltipProvider>
  )
}
