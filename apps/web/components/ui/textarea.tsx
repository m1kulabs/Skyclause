import * as React from 'react'
import { cn } from '#lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-20 w-full rounded-md border-2 border-input bg-field px-3 py-2.5 text-base leading-5 text-foreground transition-none outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-2 aria-invalid:border-foreground md:text-[14px] in-data-[slot=card]:bg-raised in-data-[slot=dialog-content]:bg-background in-data-[slot=alert-dialog-content]:bg-background in-data-[slot=sheet-content]:bg-background in-data-[slot=drawer-popup]:bg-background in-data-[slot=popover-content]:bg-background',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
