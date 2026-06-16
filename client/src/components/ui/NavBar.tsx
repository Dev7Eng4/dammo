import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface NavItem {
  id: string
  label: string
  icon: ReactNode
}

export interface NavBarProps {
  items: NavItem[]
  activeId: string
  onChange?: (id: string) => void
  className?: string
}

export function NavBar({ items, activeId, onChange, className }: NavBarProps) {
  return (
    <nav
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1.5',
        className,
      )}
      aria-label="Navigation"
    >
      {items.map((item) => {
        const isActive = item.id === activeId

        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange?.(item.id)}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-full transition-colors',
              isActive
                ? 'bg-primary-300 text-primary-900'
                : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100',
            )}
          >
            {item.icon}
          </button>
        )
      })}
    </nav>
  )
}

export function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5L12 3Z" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
    </svg>
  )
}
