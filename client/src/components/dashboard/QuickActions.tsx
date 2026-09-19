import { FileSpreadsheet, FolderKanban, Mail, Play, Clapperboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '../ui'

const actions = [
  { labelKey: 'quickActions.addEmail', to: '/mail-accounts', icon: Mail },
  { labelKey: 'quickActions.addYt', to: '/youtube-channels', icon: Clapperboard },
  { labelKey: 'quickActions.videoFactory', to: '/video-factory', icon: FolderKanban },
  { labelKey: 'quickActions.assets', to: '/assets', icon: FileSpreadsheet },
] as const

export function QuickActions() {
  const { t } = useTranslation('dashboard')

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{t('quickActions.title')}</p>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.labelKey}
              to={action.to}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-surface-elevated hover:text-foreground"
            >
              <Icon className="size-5" />
              {t(action.labelKey)}
            </Link>
          )
        })}
      </div>
      <Button asChild variant="primary" className="w-full">
        <Link to="/video-production">
          <Play className="size-4" />
          {t('quickActions.videoProduction')}
        </Link>
      </Button>
    </div>
  )
}
