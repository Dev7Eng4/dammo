import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export function DetailPanel({
  children,
  className,
  footer,
}: {
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col border-l border-border bg-surface',
        'lg:w-80 xl:w-96',
        className,
      )}
    >
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{children}</div>
      {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
    </aside>
  )
}

export function DetailSection({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {title ? (
        <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      ) : null}
      {children}
    </section>
  )
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  )
}

export function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className={cn('h-9', mono && 'font-mono text-xs')}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" variant="outlined" size="icon" className="size-9 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
