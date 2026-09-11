import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  widthClassName?: string
  headerActions?: ReactNode
  /** push = side panel in layout on lg; overlay = always fixed with backdrop */
  placement?: 'push' | 'overlay'
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
  widthClassName = 'w-full max-w-md lg:w-96',
  headerActions,
  placement = 'push',
}: DrawerProps) {
  const isOverlay = placement === 'overlay'

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Đóng panel"
        onClick={onClose}
        className={cn('fixed inset-0 z-40 bg-black/50 transition-opacity duration-150', !isOverlay && 'lg:hidden')}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface shadow-xl transition-transform duration-150',
          !isOverlay && 'lg:static lg:z-auto lg:shadow-none',
          widthClassName,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Đóng panel"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </>
  )
}
