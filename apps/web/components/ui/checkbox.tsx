'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { cn } from '#lib/utils'
import { CheckIcon } from 'lucide-react'

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // A 24px target around the 18px box (the 4px text-size square): the box is drawn by ::before so the hit area and
        // the focus ring stay 24px; a 2px muted edge (3:1) unchecked, an ink fill checked.
        'peer relative flex size-6 shrink-0 items-center justify-center rounded-sm transition-none outline-none group-has-disabled/field:opacity-60 before:absolute before:inset-[3px] before:rounded-sm before:border-2 before:border-input before:bg-field after:absolute after:-inset-x-2.5 after:-inset-y-1.5 [@media(pointer:coarse)]:after:-inset-2.5 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:before:border-foreground data-checked:text-primary-foreground data-checked:before:border-primary data-checked:before:bg-primary',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative grid place-content-center text-current transition-none [&>svg]:size-3.5 [&>svg]:stroke-3"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
