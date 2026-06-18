import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

const variants = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-600 disabled:bg-neutral-700 disabled:text-neutral-500',
  secondary:
    'border border-border bg-surface-elevated text-neutral-100 hover:bg-neutral-800 active:bg-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-border',
  inverted:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-50 active:bg-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-500',
  outlined:
    'border border-border bg-transparent text-neutral-200 hover:border-neutral-500 hover:bg-surface-elevated active:bg-neutral-800 disabled:border-border disabled:text-neutral-500',
  danger:
    'border border-danger/30 bg-transparent text-danger hover:bg-danger/10 active:bg-danger/15 disabled:border-danger/20 disabled:text-danger/40',
} as const

const sizes = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'size-10 p-0',
} as const

export type ButtonVariant = keyof typeof variants
export type ButtonSize = keyof typeof sizes

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors',
          'disabled:pointer-events-none disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
