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
  HelpCircle,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  Mail,
  Palette,
  Radio,
  Rocket,
  Settings,
  Shield,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { PageHeader, PageShell } from '../components/layout'
import { flattenNavItems, type NavIcon } from '../config/navigation'

const iconMap: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  mail: Mail,
  youtube: Clapperboard,
  tiktok: Radio,
  facebook: Globe,
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
  support: HelpCircle,
  logs: FileCode2,
  settings: Settings,
}

export function PlaceholderPage() {
  const { pathname } = useLocation()

  const match = flattenNavItems().find((item) => item.path === pathname)
  const title = match?.label ?? 'Module'
  const Icon = match ? iconMap[match.icon] : Construction

  return (
    <PageShell>
      <PageHeader
        title={title}
        subtitle="Tính năng đang phát triển. Module này sẽ có sẵn trong phiên bản tiếp theo."
        icon={Icon}
        className="mb-6"
      />
      <div className="flex min-h-[320px] flex-col items-center justify-center card-surface p-12 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface-elevated text-muted-foreground">
          <Icon className="size-8" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">Nội dung module sẽ xuất hiện tại đây.</p>
      </div>
    </PageShell>
  )
}
