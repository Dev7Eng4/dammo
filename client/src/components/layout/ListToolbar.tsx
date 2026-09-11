import { MoreHorizontal, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu'
import { cn } from '../../lib/cn'

export interface ListToolbarAction {
  id: string
  label: string
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
  separatorBefore?: boolean
}

export interface ListToolbarProps {
  countLabel?: ReactNode
  filters?: ReactNode
  primaryAction?: {
    label: string
    onClick: () => void
    disabled?: boolean
  }
  secondaryActions?: ListToolbarAction[]
  extraActions?: ReactNode
  className?: string
}

export function ListToolbar({
  countLabel,
  filters,
  primaryAction,
  secondaryActions,
  extraActions,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {countLabel ? <div className="text-sm text-muted-foreground">{countLabel}</div> : null}
        {filters}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        {secondaryActions && secondaryActions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outlined" size="sm" aria-label="Thêm thao tác">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {secondaryActions.map((action) => (
                <div key={action.id}>
                  {action.separatorBefore ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    disabled={action.disabled}
                    className={action.destructive ? 'text-danger focus:text-danger' : undefined}
                    onSelect={action.onSelect}
                  >
                    {action.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {primaryAction ? (
          <Button size="sm" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            <Plus className="size-4" />
            {primaryAction.label}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
