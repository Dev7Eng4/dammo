import {
  BookOpen,
  Clapperboard,
  Construction,
  Database,
  Factory,
  FileCode2,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  Mail,
  Palette,
  Rocket,
  Settings,
  Shield,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { PageHeader, PageShell } from '../components/layout'
import { flattenNavItems, type NavIcon } from '../config/navigation'

const iconMap: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  mail: Mail,
  youtube: Clapperboard,
  source: BookOpen,
  prompt: Lightbulb,
  'visual-styles': Palette,
  browser: Globe,
  gpm: UserPlus,
  proxies: Shield,
  'launch-logs': Rocket,
  projects: FolderKanban,
  scripts: FileCode2,
  datasets: Database,
  assets: Image,
  excel: FileSpreadsheet,
  templates: LayoutTemplate,
  factory: Factory,
  queue: ListTodo,
  'task-queue': ListTodo,
  logs: FileCode2,
  settings: Settings,
}

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const { t } = useTranslation(['nav', 'common'])

  const match = flattenNavItems().find((item) => item.path === pathname)
  const title = match ? t(match.labelKey) : t('common:placeholder.fallbackTitle')
  const Icon = match ? iconMap[match.icon] : Construction

  return (
    <PageShell>
      <PageHeader
        title={title}
        subtitle={t('common:placeholder.subtitle')}
        icon={Icon}
        className="mb-6"
      />
      <div className="flex min-h-[320px] flex-col items-center justify-center card-surface p-12 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface-elevated text-muted-foreground">
          <Icon className="size-8" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{t('common:placeholder.body')}</p>
      </div>
    </PageShell>
  )
}
