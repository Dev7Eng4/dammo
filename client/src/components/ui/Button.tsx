import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

const buttonVariants = cva(
  [
    'inline-flex cursor-pointer items-center justify-center rounded-lg font-medium',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:cursor-not-allowed',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary-500 text-on-primary hover:bg-primary-400 active:bg-primary-600 disabled:bg-muted disabled:text-muted-foreground',
        secondary:
          'border border-border bg-surface-elevated text-foreground hover:bg-muted active:bg-muted disabled:bg-muted disabled:text-muted-foreground',
        inverted:
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-50 active:bg-neutral-200 disabled:bg-muted disabled:text-muted-foreground',
        outlined:
          'border border-border bg-transparent text-foreground/90 hover:border-neutral-500 hover:bg-surface-elevated active:bg-muted disabled:border-border disabled:text-muted-foreground',
        danger:
          'border border-danger/30 bg-transparent text-danger hover:bg-danger/10 active:bg-danger/15 disabled:border-danger/20 disabled:text-danger/40',
        accent:
          'bg-accent text-accent-foreground hover:bg-tertiary-400 active:bg-tertiary-600 disabled:bg-muted disabled:text-muted-foreground',
        ghost:
          'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:text-muted-foreground/50',
      },
      size: {
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'

export { buttonVariants }
