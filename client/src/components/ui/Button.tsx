import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

const variants = {
  primary:
    'bg-primary-300 text-primary-900 hover:bg-primary-200 active:bg-primary-400',
  secondary:
    'bg-neutral-800 text-neutral-100 hover:bg-neutral-700 active:bg-neutral-600',
  inverted:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-50 active:bg-neutral-200',
  outlined:
    'border border-neutral-300 bg-transparent text-neutral-100 hover:bg-neutral-800/60 active:bg-neutral-800',
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
          'inline-flex cursor-pointer items-center justify-center rounded-full font-medium transition-colors',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
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
