import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}

export function Modal({ open, onClose, title, children, footer, className, bodyClassName }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60',
            'data-[state=open]:ui-overlay-open data-[state=closed]:ui-overlay-closed',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-border bg-surface shadow-xl outline-none',
            'data-[state=open]:ui-dialog-open data-[state=closed]:ui-dialog-closed',
            className,
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
            <Dialog.Close
              type="button"
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Đóng"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
