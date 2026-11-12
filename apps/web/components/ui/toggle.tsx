'use client'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils'

const toggleVariants = cva(
  'group/toggle relative inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-input in-data-[slot=toggle-group]:border-transparent text-[14px] leading-5 font-medium whitespace-nowrap text-muted-foreground transition-[transform,opacity] outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'bg-control hover:bg-accent'
      },
      size: {
        default: 'h-9 min-w-9 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        sm: "h-9 min-w-9 rounded-full px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 min-w-12 px-5 text-[16px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4'
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
