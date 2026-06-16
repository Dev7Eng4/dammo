import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leadingIcon, type = 'text', ...props }, ref) => {
    return (
      <div className="relative w-full">
        {leadingIcon ? (
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-neutral-400">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          className={cn(
            'h-12 w-full rounded-full border border-border bg-surface-elevated text-sm text-neutral-100',
            'placeholder:text-neutral-500',
            'transition-colors focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30',
            leadingIcon ? 'pl-11 pr-4' : 'px-4',
            className,
          )}
          {...props}
        />
      </div>
    )
  },
)

Input.displayName = 'Input'

export function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="size-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function SearchInput(props: Omit<InputProps, 'leadingIcon' | 'type'>) {
  return <Input leadingIcon={<SearchIcon />} type="search" placeholder="Search" {...props} />
}
