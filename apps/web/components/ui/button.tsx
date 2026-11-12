import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#lib/utils'

const buttonVariants = cva(
  // A capsule: 36px in the app, 48px (`lg`) on public pages. Primary by inversion; secondary is a filled control with a
  // 2px muted edge (3:1). Every capsule keeps a 2px border so forced colours draw it, and high contrast inks it. The
  // global :focus-visible outline is the ring.
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-transparent [.hc_&]:border-(--edge) bg-clip-padding text-[14px] leading-5 font-medium whitespace-nowrap transition-[transform,opacity] outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border-input bg-control text-foreground hover:bg-accent aria-expanded:bg-accent',
        secondary: 'border-input bg-control text-foreground hover:bg-accent aria-expanded:bg-accent',
        ghost: 'bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted',
        destructive: 'border-foreground bg-transparent text-foreground hover:bg-muted',
        link: 'rounded-none border-0 text-foreground underline underline-offset-3 hover:decoration-2 [.hc_&]:border-0'
      },
      size: {
        default: 'h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-9 gap-1 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 gap-2 px-6 text-[16px] leading-6 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5',
        icon: 'size-9',
        'icon-xs': "size-9 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-9',
        'icon-lg': 'size-12'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
