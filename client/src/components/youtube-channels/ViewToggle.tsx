import { LayoutGrid, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

export type ChannelsView = 'table' | 'cards'

export function readStoredView(storageKey: string): ChannelsView {
  try {
    return localStorage.getItem(storageKey) === 'cards' ? 'cards' : 'table'
  } catch {
    return 'table'
  }
}

export function storeView(storageKey: string, view: ChannelsView): void {
  try {
    localStorage.setItem(storageKey, view)
  } catch {
    /* storage unavailable */
  }
}

interface ViewToggleProps {
  value: ChannelsView
  onChange: (next: ChannelsView) => void
}

const options = [
  { key: 'table' as const, Icon: Table2, labelKey: 'cards.viewTable' },
  { key: 'cards' as const, Icon: LayoutGrid, labelKey: 'cards.viewCards' },
]

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const { t } = useTranslation('youtube')
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-elevated p-0.5">
      {options.map(({ key, Icon, labelKey }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === key ? 'bg-primary-500 text-on-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {t(labelKey)}
        </button>
      ))}
    </div>
  )
}
