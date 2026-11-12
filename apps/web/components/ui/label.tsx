'use client'

import * as React from 'react'
import { cn } from '#lib/utils'

function Label({ className, htmlFor, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-[14px] leading-5 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-60 peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className
      )}
      {...props}
    />
  )
}

export { Label }
