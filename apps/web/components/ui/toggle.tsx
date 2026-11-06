'use client'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils'

const toggleVariants = cva(
  'group/toggle relative inline-flex items-center justify-center gap-1 rounded-full text-[13px] font-medium whitespace-nowrap outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-(--selection-width) after:bg-selection after:opacity-0 aria-pressed:after:opacity-100 data-[state=on]:after:opacity-100 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-muted'
      },
      size: {
        default: 'h-8.5 min-w-8.5 px-3.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: "h-8.5 min-w-8.5 rounded-full px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 min-w-10 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle, toggleVariants }
