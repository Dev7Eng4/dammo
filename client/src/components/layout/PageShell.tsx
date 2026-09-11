import { cn } from '../../lib/cn'
import type { ReactNode } from 'react'

export interface PageShellProps {
  children: ReactNode
  /** Full-height list layouts that manage their own scroll */
  fullBleed?: boolean
  className?: string
}

export function PageShell({ children, fullBleed = false, className }: PageShellProps) {
  if (fullBleed) {
    return (
      <div className={cn('flex h-full min-h-0 flex-col p-6', className)}>
        {children}
      </div>
    )
  }

  return <div className={cn('space-y-6 p-6', className)}>{children}</div>
}
