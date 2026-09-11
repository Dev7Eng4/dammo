import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/cn'
import type { ReactNode } from 'react'

export interface PageTabItem {
  id: string
  label: string
  disabled?: boolean
}

export interface PageTabsProps {
  items: PageTabItem[]
  value: string
  onValueChange: (value: string) => void
  variant?: 'underline' | 'pill'
  className?: string
  trailing?: ReactNode
}

export function PageTabs({
  items,
  value,
  onValueChange,
  variant = 'underline',
  className,
  trailing,
}: PageTabsProps) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={cn('w-full', className)}>
      <div className="flex items-center justify-between gap-3">
        <TabsPrimitive.List
          className={cn(
            'flex items-center gap-1',
            variant === 'underline' && 'border-b border-border',
            variant === 'pill' && 'rounded-lg bg-muted p-1',
          )}
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.id}
              value={item.id}
              disabled={item.disabled}
              className={cn(
                'relative px-3 py-2 text-sm font-medium transition-colors duration-150',
                'text-muted-foreground hover:text-foreground',
                'disabled:pointer-events-none disabled:opacity-40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                variant === 'underline' &&
                  'rounded-none border-b-2 border-transparent data-[state=active]:border-primary-500 data-[state=active]:text-foreground',
                variant === 'pill' &&
                  'rounded-md data-[state=active]:bg-primary-500/15 data-[state=active]:text-foreground',
              )}
            >
              {item.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {trailing}
      </div>
    </TabsPrimitive.Root>
  )
}
