'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils'

import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Textarea } from '#ui/textarea'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      data-focus-ring
      className={cn(
        'group/input-group relative flex h-10 w-full min-w-0 items-center rounded-md border-2 border-input bg-field transition-none outline-none has-[[data-slot=input-group-control]:focus-visible]:outline-(length:--focus-width) has-[[data-slot=input-group-control]:focus-visible]:outline-solid has-[[data-slot=input-group-control]:focus-visible]:outline-(--focus) has-[[data-slot=input-group-control]:focus-visible]:outline-offset-2 has-disabled:opacity-60 has-[[data-slot][aria-invalid=true]]:border-2 has-[[data-slot][aria-invalid=true]]:border-foreground has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5 in-data-[slot=card]:bg-raised in-data-[slot=dialog-content]:bg-background in-data-[slot=alert-dialog-content]:bg-background in-data-[slot=sheet-content]:bg-background in-data-[slot=drawer-popup]:bg-background in-data-[slot=popover-content]:bg-background',
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-[14px] font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-60 [&>kbd]:rounded-full [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-3 has-[>button]:ml-[-0.5rem] has-[>kbd]:ml-[-0.15rem]',
        'inline-end': 'order-last pr-3 has-[>button]:mr-[-0.5rem] has-[>kbd]:mr-[-0.15rem]',
        'block-start': 'order-first w-full justify-start px-3 pt-2.5 group-has-[>input]/input-group:pt-2.5',
        'block-end': 'order-last w-full justify-start px-3 pb-2.5 group-has-[>input]/input-group:pb-2.5'
      }
    },
    defaultVariants: {
      align: 'inline-start'
    }
  }
)

function InputGroupAddon({
  className,
  align = 'inline-start',
  onClick,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- A pointer shortcut to the control, which stays reachable by keyboard on its own.
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(event) => {
        onClick?.(event)
        // The addon is `cursor-text`: a click on its padding or icon focuses the control, as a label would.
        if ((event.target as HTMLElement).closest('button')) return
        event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-slot=input-group-control]')?.focus()
      }}
      {...props}
    />
  )
}

// Inside a 40px field the buttons are 32px capsules (still over the 24px target; coarse pointers lift them to 44px).
const inputGroupButtonVariants = cva('flex items-center gap-2 text-[14px] shadow-none', {
  variants: {
    size: {
      xs: "h-8 gap-1 rounded-full px-2.5 [&>svg:not([class*='size-'])]:size-3.5",
      sm: 'h-8 rounded-full px-3',
      'icon-xs': 'size-8 rounded-full p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 rounded-full p-0 has-[>svg]:p-0'
    }
  },
  defaultVariants: {
    size: 'xs'
  }
})

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: 'button' | 'submit' | 'reset'
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-[14px] text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:outline-none! disabled:bg-transparent aria-invalid:border-0',
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-2.5 shadow-none ring-0 focus-visible:outline-none! disabled:bg-transparent aria-invalid:border-0',
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea }
