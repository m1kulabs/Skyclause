import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '#lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Filled on the field tone with a 2px muted edge (3:1 non-text): one tone up inside a card, down to the ground in
        // anything raised that floats (dialogs, sheets, drawers, popovers).
        'h-10 w-full min-w-0 rounded-md border-2 border-input bg-field px-3 py-2 text-base text-foreground transition-none outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[14px] file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-2 aria-invalid:border-foreground md:text-[14px] in-data-[slot=card]:bg-raised in-data-[slot=dialog-content]:bg-background in-data-[slot=alert-dialog-content]:bg-background in-data-[slot=sheet-content]:bg-background in-data-[slot=drawer-popup]:bg-background in-data-[slot=popover-content]:bg-background',
        className
      )}
      {...props}
    />
  )
}

export { Input }
