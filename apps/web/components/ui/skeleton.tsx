import { cn } from '#lib/utils'

// A flat raised tone at the real size of what loads (no shimmer). Pass `rounded-full` where it stands for a capsule.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('rounded-md bg-raised', className)} {...props} />
}

export { Skeleton }
