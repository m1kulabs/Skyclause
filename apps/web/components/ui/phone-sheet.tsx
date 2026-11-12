'use client'

import * as React from 'react'
import { cn } from '#lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '#ui/sheet'

/**
 * The phone's navigation sheet: a bottom sheet nearly the screen's height, opened from the bar's menu button. Its
 * items are 48px rows; the current one shows the text-size capsule mark beside its label, not a colour alone.
 */
function PhoneSheet({
  trigger,
  title,
  children,
  open,
  onOpenChange,
  className
}: {
  /** The menu button, rendered as the sheet's trigger (pass a Button). */
  trigger: React.ReactElement
  title: React.ReactNode
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent
        side="bottom"
        data-slot="phone-sheet"
        className={cn(
          'max-h-[calc(100svh-16px)] overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))]',
          className
        )}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div data-slot="phone-sheet-body" className="flex flex-col gap-1 px-3">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** One destination in the phone sheet; set `current` on the page you are on (adds aria-current="page"). */
function PhoneSheetItem({
  className,
  current = false,
  children,
  ...props
}: React.ComponentProps<'a'> & { current?: boolean }) {
  return (
    <a
      data-slot="phone-sheet-item"
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex min-h-12 items-center justify-between gap-3 rounded-full px-4 text-[16px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-raised aria-[current=page]:text-foreground aria-[current=page]:after:h-1 aria-[current=page]:after:w-4 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-current aria-[current=page]:after:content-[""]',
        className
      )}
      {...props}
    >
      {children}
    </a>
  )
}

export { PhoneSheet, PhoneSheetItem }
