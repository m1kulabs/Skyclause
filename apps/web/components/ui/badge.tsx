import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils'

const badgeVariants = cva(
  // A capsule at text size (24px). Never a hue: modes have their own badge in features/brand.
  'group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border-2 border-transparent px-2.5 text-[13px] leading-none font-medium whitespace-nowrap transition-[transform,opacity] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-foreground [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground in-data-[slot=card]:bg-overlay [a]:hover:bg-accent',
        destructive: 'border-foreground bg-transparent text-destructive [a]:hover:bg-muted',
        outline: 'border-input text-foreground [a]:hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-foreground underline underline-offset-3'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className)
      },
      props
    ),
    render,
    state: {
      slot: 'badge',
      variant
    }
  })
}

export { Badge, badgeVariants }
