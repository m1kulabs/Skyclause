'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '#lib/utils'

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 border-input transition-[transform,opacity] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 [@media(pointer:coarse)]:after:-inset-y-3 aria-invalid:border-foreground data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-6 data-[size=sm]:w-9 data-checked:border-primary data-checked:bg-primary data-unchecked:bg-field data-disabled:cursor-not-allowed data-disabled:opacity-60',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-5 group-data-[size=default]/switch:data-checked:translate-x-4 group-data-[size=sm]/switch:data-checked:translate-x-3 data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
