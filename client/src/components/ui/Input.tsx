import { Search } from 'lucide-react'
import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode
  /** Use pill radius (default for search). Form fields use rounded-lg. */
  pill?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leadingIcon, type = 'text', pill = false, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {leadingIcon ? (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          className={cn(
            'h-10 w-full border border-border bg-surface-elevated text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'transition-colors duration-150 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30',
            pill ? 'rounded-full' : 'rounded-lg',
            leadingIcon ? 'pl-10 pr-4' : 'px-3.5',
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
  return <Search className="size-4" aria-hidden="true" />
}

export function SearchInput(props: Omit<InputProps, 'leadingIcon' | 'type'>) {
  return (
    <Input
      leadingIcon={<SearchIcon />}
      type="search"
      placeholder="Tìm kiếm"
      pill
      {...props}
    />
  )
}
